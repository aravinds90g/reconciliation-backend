const express = require('express');
const router = express.Router();
const { getUsers, updateUser, createUser } = require('../controllers/user.controller');
const { isAdmin } = require('../middleware/auth');

// All routes here require Admin privileges (already protected by authenticate in app.js, adding isAdmin here)
router.post('/', isAdmin, createUser);  // Create new user
router.get('/', isAdmin, getUsers);     // Get all users
router.put('/:id', isAdmin, updateUser); // Update user

module.exports = router;
