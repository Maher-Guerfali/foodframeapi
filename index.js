const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Error handler middleware
const handleError = (res, error, message = 'An error occurred') => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    error: message,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Validation middleware
const validateRequired = (fields) => (req, res, next) => {
  const missing = fields.filter(field => !req.body[field]);
  if (missing.length) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
      missingFields: missing
    });
  }
  next();
};

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// ==================== USER ROUTES ====================

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) throw error;
    
    res.json({
      success: true,
      count: data.length,
      users: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch users');
  }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      throw error;
    }
    
    res.json({
      success: true,
      user: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch user');
  }
});

// Create new user
app.post('/api/users', validateRequired(['username']), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([req.body])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to create user');
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      user: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update user');
  }
});

// ==================== ERROR HANDLERS ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET    /api/health',
      'GET    /api/users',
      'GET    /api/users/:id',
      'POST   /api/users',
      'PUT    /api/users/:id'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Access the API at http://localhost:${port}`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});
