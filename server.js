const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const mammoth = require('mammoth');
const AsyncLock = require('async-lock');
const mkdirp = require('mkdirp'); // To create directories recursively
const crypto = require('crypto'); // To generate unique filenames
const mongoose = require('mongoose');
const WebSocket = require('ws');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000;
const lock = new AsyncLock();

app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images'))); // Serve images from the 'images' directory

const imagesDir = path.join(__dirname, 'images');

// Ensure the images directory exists
mkdirp.sync(imagesDir);

// MongoDB connection using environment variable
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

const visitorSchema = new mongoose.Schema({
  count: { type: Number, default: 0 },
});

const Visitor = mongoose.model('Visitor', visitorSchema);

const getVisitorCount = async () => {
  const visitor = await Visitor.findOne();
  if (!visitor) {
    const newVisitor = new Visitor({ count: 0 });
    await newVisitor.save();
    return 0;
  }
  return visitor.count;
};

const incrementVisitorCount = async () => {
  return lock.acquire('visitor', async () => {
    const visitor = await Visitor.findOne();
    if (!visitor) {
      const newVisitor = new Visitor({ count: 1 });
      await newVisitor.save();
      return 1;
    }
    visitor.count += 1;
    await visitor.save();
    return visitor.count;
  });
};

const saveImage = async (imageBuffer, filename) => {
  const imagePath = path.join(imagesDir, filename);
  await fs.writeFile(imagePath, imageBuffer);
  return `/images/${filename}`;
};

app.get('/convert', async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    const fullPath = path.join(__dirname, filePath);
    if (!fullPath.startsWith(__dirname)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    const buffer = await fs.readFile(fullPath);

    const result = await mammoth.convertToHtml({
      buffer,
      convertImage: mammoth.images.inline(async (element) => {
        const extension = element.contentType.split('/')[1];
        const filename = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
        const imageBuffer = await element.read();
        const imageUrl = await saveImage(imageBuffer, filename);
        return { src: imageUrl };
      }),
    });

    res.status(200).json({ html: result.value });
  } catch (error) {
    console.error('Error converting document:', error);
    res.status(500).json({ error: 'Error converting document' });
  }
});

app.get('/api/visitors', async (req, res) => {
  try {
    const count = await incrementVisitorCount();
    res.json({ count });
    broadcastVisitorCount(count);
  } catch (error) {
    console.error('Error updating visitor count:', error);
    res.status(500).json({ error: 'Error updating visitor count' });
  }
});

app.get('/', (req, res) => {
  res.send('<h1>Welcome to the backend of Mujjus-web</p>');
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// WebSocket server setup
const wss = new WebSocket.Server({ server });

const broadcastVisitorCount = (count) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ count }));
    }
  });
};

wss.on('connection', (ws) => {
  getVisitorCount().then((count) => {
    ws.send(JSON.stringify({ count }));
  });
});
