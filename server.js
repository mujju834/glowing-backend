// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const visitorFilePath = path.join(__dirname, 'visitors.json');

const getVisitorCount = () => {
  if (fs.existsSync(visitorFilePath)) {
    const data = fs.readFileSync(visitorFilePath, 'utf-8');
    const json = JSON.parse(data);
    return json.count;
  }
  return 0;
};

const incrementVisitorCount = () => {
  const count = getVisitorCount() + 1;
  fs.writeFileSync(visitorFilePath, JSON.stringify({ count }), 'utf-8');
  return count;
};

app.get('/api/visitors', (req, res) => {
  const count = incrementVisitorCount();
  res.json({ count });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
