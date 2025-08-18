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
  public_users: {
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

// Route to get database schema
app.get('/api/schema', (req, res) => {
  res.json(databaseSchema);
});

// Get all users with their profiles
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
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific user by ID
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

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user intake records
app.get('/api/users/:id/intake', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('intake')
      .select('*')
      .eq('user_id', req.params.id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user intake record
app.post('/api/users/:id/intake', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('intake')
      .insert({
        user_id: req.params.id,
        ...req.body
      })
      .select();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});