require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Test route
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Anon Key in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'FoodFrame API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET    /api/test',
      'GET    /admin/users',
      'GET    /:username/getalldata',
      'PATCH  /:username/update'
    ]
  });
});

// Get all users' data (admin only)
app.get('/admin/users', async (req, res) => {
  console.log('GET /admin/users - Request received');
  
  try {
    // Log environment variables (safely)
    console.log('Supabase URL:', process.env.SUPABASE_URL ? '***URL is set***' : 'MISSING');
    
    // Get all users with their profiles and intake data in a single query
    console.log('Fetching users with profiles and intake data...');
    const { data: users, error: usersError } = await supabase
      .from('public_users')
      .select(`
        *,
        profiles(*),
        intake(*)
      `);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ 
        success: false,
        error: 'Error fetching users',
        details: usersError.message 
      });
    }

    // Format the response
    const formattedUsers = users.map(user => ({
      id: user.id,
      auth_id: user.auth_id,
      username: user.username,
      age: user.age,
      weight: user.weight,
      height: user.height,
      gender: user.gender,
      goals: user.goals,
      allergies: user.allergies,
      profile: user.profiles || {},
      intake: user.intake || []
    }));

    console.log('Sending response with user data');
    res.json({
      success: true,
      count: formattedUsers.length,
      data: formattedUsers
    });
    
  } catch (error) {
    console.error('Error in /admin/users:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all data for a specific user by username
app.get('/:username/getalldata', async (req, res) => {
  try {
    const { username } = req.params;

    // First, get the user ID from the username
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Then get all intake data for this user
    const { data: intakeData, error: intakeError } = await supabase
      .from('intake')
      .select('*')
      .eq('user_id', user.id);

    if (intakeError) {
      console.error('Error fetching intake data:', intakeError);
      return res.status(500).json({ error: 'Error fetching intake data' });
    }

    // Combine user data with intake data
    const response = {
      user,
      intake: intakeData || []
    };

    res.json(response);
  } catch (error) {
    console.error('Error in /:username/getalldata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update specific user fields
app.patch('/:username/update', async (req, res) => {
  try {
    const { username } = req.params;
    const updateData = req.body;

    // Remove any fields that shouldn't be updated
    const allowedFields = [
      'age', 'weight', 'height', 'body_fat_percentage', 
      'gender', 'goals', 'allergies', 'conditions', 'medications'
    ];
    
    const validUpdate = {};
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        validUpdate[key] = updateData[key];
      }
    });

    if (Object.keys(validUpdate).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at timestamp
    validUpdate.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update(validUpdate)
      .eq('username', username)
      .select();

    if (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ error: 'Error updating user' });
    }

    res.json({ message: 'User updated successfully', data });
  } catch (error) {
    console.error('Error in /:username/update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export the Express app for use in other files
module.exports = app;

// Only start the server if this file is run directly (not required)
if (require.main === module) {
  // Initialize Supabase client
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  
  // Start the server
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
