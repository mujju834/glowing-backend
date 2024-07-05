const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const mammoth = require('mammoth');
const AsyncLock = require('async-lock');
const mkdirp = require('mkdirp'); // To create directories recursively
const crypto = require('crypto'); // To generate unique filenames

const app = express();
const port = process.env.PORT || 5000;
const lock = new AsyncLock();

app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images'))); // Serve images from the 'images' directory

const visitorFilePath = path.join(__dirname, 'visitors.json');
const imagesDir = path.join(__dirname, 'images');

// Ensure the images directory exists
mkdirp.sync(imagesDir);

const getVisitorCount = async () => {
  try {
    const data = await fs.readFile(visitorFilePath, 'utf-8');
    const json = JSON.parse(data);
    console.log('Current visitor count:', json.count);
    return json.count;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Visitors file not found, starting from 0');
      return 0;
    }
    console.error('Error reading visitor file:', error);
    throw error;
  }
};

const incrementVisitorCount = async () => {
  return lock.acquire('visitor', async () => {
    try {
      const count = await getVisitorCount() + 1;
      await fs.writeFile(visitorFilePath, JSON.stringify({ count }), 'utf-8');
      console.log('Updated visitor count:', count);
      return count;
    } catch (error) {
      console.error('Error updating visitor count:', error);
      throw error;
    }
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
  } catch (error) {
    console.error('Error updating visitor count:', error);
    res.status(500).json({ error: 'Error updating visitor count' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
