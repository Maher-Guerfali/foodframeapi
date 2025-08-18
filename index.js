const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Database Schema Documentation
const databaseSchema = {
  auth_users: {
    description: "Authentication user table in Supabase",
    columns: [
      { name: "id", type: "uuid", description: "Unique user identifier" },
      { name: "email", type: "string", description: "User's email address" },
      { name: "created_at", type: "timestamp", description: "User creation timestamp" },
      { name: "last_sign_in_at", type: "timestamp", description: "Last login timestamp" },
      { name: "raw_user_meta_data", type: "jsonb", description: "Additional user metadata" }
    ]
  },
  users: {
    description: "Application-specific user details",
    columns: [
      { name: "id", type: "uuid", description: "Unique user identifier" },
      { name: "auth_id", type: "uuid", description: "Reference to auth.users table" },
      { name: "username", type: "string", description: "Unique username" },
      { name: "age", type: "integer", description: "User's age" },
      { name: "weight", type: "numeric", description: "User's weight" },
      { name: "height", type: "numeric", description: "User's height" },
      { name: "gender", type: "string", description: "User's gender" },
      { name: "goals", type: "string", description: "User's fitness goals" },
      { name: "allergies", type: "string[]", description: "List of user's allergies" }
    ]
  },
  profiles: {
    description: "User profile information",
    columns: [
      { name: "id", type: "uuid", description: "Unique profile identifier" },
      { name: "username", type: "string", description: "Unique username" },
      { name: "full_name", type: "string", description: "User's full name" },
      { name: "avatar_url", type: "string", description: "URL to user's avatar" },
      { name: "age", type: "integer", description: "User's age" },
      { name: "bio", type: "string", description: "User's profile bio" },
      { name: "location", type: "string", description: "User's location" }
    ]
  },
  intake: {
    description: "User's daily nutritional intake",
    columns: [
      { name: "id", type: "uuid", description: "Unique intake record identifier" },
      { name: "user_id", type: "uuid", description: "Reference to the user" },
      { name: "date", type: "date", description: "Date of intake" },
      { name: "calories", type: "numeric", description: "Total calories consumed" },
      { name: "protein", type: "numeric", description: "Protein intake" },
      { name: "carbs", type: "numeric", description: "Carbohydrates intake" },
      { name: "fats", type: "numeric", description: "Fats intake" },
      { name: "fiber", type: "numeric", description: "Fiber intake" },
      { name: "water", type: "integer", description: "Water intake in ml" }
    ]
  }
};

// ==================== UTILITY FUNCTIONS ====================

// Error handler middleware
const handleError = (res, error, message = 'An error occurred') => {
  console.error('Error:', error);
  res.status(500).json({ 
    error: message,
    details: error.message 
  });
};

// Validation middleware
const validateRequired = (fields) => {
  return (req, res, next) => {
    const missingFields = fields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields
      });
    }
    next();
  };
};

// ==================== SCHEMA ROUTES ====================

// Get database schema
app.get('/api/schema', (req, res) => {
  res.json(databaseSchema);
});

// ==================== USER ROUTES ====================

// Get all users with their profiles and intake data
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        profiles(*),
        intake(*)
      `);
    
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

// Get specific user by ID with all related data
app.get('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        profiles(*),
        intake(*)
      `)
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
app.post('/api/users', validateRequired(['username', 'age']), async (req, res) => {
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

// Update user data
app.put('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
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

// Partially update user data (PATCH)
app.patch('/api/users/:id', async (req, res) => {
  try {
    // Remove undefined/null values
    const updateData = Object.fromEntries(
      Object.entries(req.body).filter(([_, v]) => v != null)
    );
    
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
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

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully',
      deletedUser: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to delete user');
  }
});

// ==================== PROFILE ROUTES ====================

// Get all profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) throw error;
    res.json({
      success: true,
      count: data.length,
      profiles: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch profiles');
  }
});

// Get profile by user ID
app.get('/api/users/:id/profile', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false,
          error: 'Profile not found' 
        });
      }
      throw error;
    }
    
    res.json({
      success: true,
      profile: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch profile');
  }
});

// Create or update profile
app.post('/api/users/:id/profile', async (req, res) => {
  try {
    const profileData = {
      id: req.params.id,
      ...req.body
    };
    
    const { data, error } = await supabase
      .from('profiles')
      .upsert([profileData])
      .select();
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: 'Profile created/updated successfully',
      profile: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to create/update profile');
  }
});

// Update profile
app.put('/api/users/:id/profile', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(req.body)
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update profile');
  }
});

// ==================== INTAKE ROUTES ====================

// Get all intake records for a user
app.get('/api/users/:id/intake', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('intake')
      .select('*')
      .eq('user_id', req.params.id)
      .order('date', { ascending: false });
    
    if (error) throw error;
    res.json({
      success: true,
      count: data.length,
      intake: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch intake records');
  }
});

// Get intake records for a specific date range
app.get('/api/users/:id/intake/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters are required'
      });
    }
    
    const { data, error } = await supabase
      .from('intake')
      .select('*')
      .eq('user_id', req.params.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
    
    if (error) throw error;
    res.json({
      success: true,
      count: data.length,
      intake: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch intake records for date range');
  }
});

// Create new intake record
app.post('/api/users/:id/intake', validateRequired(['date', 'calories']), async (req, res) => {
  try {
    const intakeData = {
      user_id: req.params.id,
      ...req.body
    };
    
    const { data, error } = await supabase
      .from('intake')
      .insert([intakeData])
      .select();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      message: 'Intake record created successfully',
      intake: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to create intake record');
  }
});

// Update intake record
app.put('/api/intake/:intakeId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('intake')
      .update(req.body)
      .eq('id', req.params.intakeId)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Intake record not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Intake record updated successfully',
      intake: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to update intake record');
  }
});

// Delete intake record
app.delete('/api/intake/:intakeId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('intake')
      .delete()
      .eq('id', req.params.intakeId)
      .select();
    
    if (error) throw error;
    
    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Intake record not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Intake record deleted successfully',
      deletedIntake: data[0]
    });
  } catch (error) {
    handleError(res, error, 'Failed to delete intake record');
  }
});

// ==================== ANALYTICS ROUTES ====================

// Get user statistics
app.get('/api/users/:id/stats', async (req, res) => {
  try {
    const { data: intakeData, error } = await supabase
      .from('intake')
      .select('calories, protein, carbs, fats, fiber, water, date')
      .eq('user_id', req.params.id);
    
    if (error) throw error;
    
    if (intakeData.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalRecords: 0,
          averageCalories: 0,
          averageProtein: 0,
          averageCarbs: 0,
          averageFats: 0,
          averageFiber: 0,
          averageWater: 0
        }
      });
    }
    
    const stats = {
      totalRecords: intakeData.length,
      averageCalories: intakeData.reduce((sum, record) => sum + (record.calories || 0), 0) / intakeData.length,
      averageProtein: intakeData.reduce((sum, record) => sum + (record.protein || 0), 0) / intakeData.length,
      averageCarbs: intakeData.reduce((sum, record) => sum + (record.carbs || 0), 0) / intakeData.length,
      averageFats: intakeData.reduce((sum, record) => sum + (record.fats || 0), 0) / intakeData.length,
      averageFiber: intakeData.reduce((sum, record) => sum + (record.fiber || 0), 0) / intakeData.length,
      averageWater: intakeData.reduce((sum, record) => sum + (record.water || 0), 0) / intakeData.length,
      latestEntry: intakeData.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    };
    
    // Round averages to 2 decimal places
    Object.keys(stats).forEach(key => {
      if (key.startsWith('average') && typeof stats[key] === 'number') {
        stats[key] = Math.round(stats[key] * 100) / 100;
      }
    });
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    handleError(res, error, 'Failed to fetch user statistics');
  }
});

// ==================== SEARCH AND FILTER ROUTES ====================

// Search users by username or goals
app.get('/api/users/search', async (req, res) => {
  try {
    const { q, goal, minAge, maxAge } = req.query;
    
    let query = supabase.from('users').select('*');
    
    if (q) {
      query = query.or(`username.ilike.%${q}%,goals.ilike.%${q}%`);
    }
    
    if (goal) {
      query = query.ilike('goals', `%${goal}%`);
    }
    
    if (minAge) {
      query = query.gte('age', parseInt(minAge));
    }
    
    if (maxAge) {
      query = query.lte('age', parseInt(maxAge));
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    res.json({
      success: true,
      count: data.length,
      users: data
    });
  } catch (error) {
    handleError(res, error, 'Failed to search users');
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/schema',
      'GET /api/users',
      'GET /api/users/:id',
      'POST /api/users',
      'PUT /api/users/:id',
      'PATCH /api/users/:id',
      'DELETE /api/users/:id',
      'GET /api/users/:id/profile',
      'POST /api/users/:id/profile',
      'PUT /api/users/:id/profile',
      'GET /api/users/:id/intake',
      'POST /api/users/:id/intake',
      'PUT /api/intake/:intakeId',
      'DELETE /api/intake/:intakeId',
      'GET /api/users/:id/stats',
      'GET /api/users/search'
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
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`📖 API Schema: http://localhost:${port}/api/schema`);
});