const express = require('express');
const router = express.Router();
const { getUsers, updateUser } = require('../controllers/user.controller');
const { isAdmin } = require('../middleware/auth');

// All routes here require Admin privileges (already protected by authenticate in app.js, adding isAdmin here)
router.get('/', isAdmin, getUsers);
router.put('/:id', isAdmin, updateUser);

module.exports = router;
