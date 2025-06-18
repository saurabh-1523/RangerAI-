require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('ERROR: Missing OPENAI_API_KEY in environment variables');
  process.exit(1);
}

// Enhanced middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer with file size limits
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Proxy endpoint for OpenAI API
app.post('/api/openai', upload.single('image'), async (req, res, next) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Validate image if present
    let imageUrl;
    if (req.file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
      const fileType = req.file.mimetype;
      
      if (!allowedTypes.includes(fileType)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Only JPEG/PNG images are allowed' });
      }

      imageUrl = {
        url: `data:${fileType};base64,${fs.readFileSync(req.file.path, 'base64')}`
      };
      fs.unlinkSync(req.file.path); // Clean up
    }

    // Prepare OpenAI request
    const messages = [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...(imageUrl ? [{ type: "image_url", image_url: imageUrl }] : [])
      ]
    }];

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4o",
        messages,
        max_tokens: 1000
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    res.json(response.data);
  } catch (error) {
    // Clean up uploaded file if error occurred
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }

    console.error('OpenAI API Error:', error.response?.data || error.message);
    
    // Forward the error to the error handling middleware
    next(error);
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? '*** Configured ***' : 'MISSING!');
});