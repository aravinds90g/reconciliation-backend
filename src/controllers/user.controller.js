const User = require('../models/User');
const { createAuditLog } = require('../services/auditService');
const bcrypt = require('bcryptjs');

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, password, and role are required'
      });
    }

    if (!['admin', 'analyst', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be admin, analyst, or viewer'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      isActive: true
    });

    await user.save();

    // Audit log
    await createAuditLog({
      action: 'CREATE',
      entity: 'USER',
      entityId: user._id,
      userId: req.user.id,
      changes: {
        newValue: { name, email, role }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    
    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
      
    const total = await User.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        data: users, // Standardized for frontend
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { role, isActive } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Prevent modifying own role/status to avoid lockout
    if (user._id.toString() === req.user.id) {
        // Allow updating other fields if we had them, but for role/active status it's risky
        // If an admin demotes themselves, they lose access.
        // We will allow it but with a warning in real world, here just allow it or block?
        // Let's block self-demotion/deactivation for safety in this MVP.
        if (role && role !== 'admin') {
             return res.status(400).json({
                success: false,
                error: 'You cannot demote yourself from admin.'
              });
        }
         if (isActive === false) {
             return res.status(400).json({
                success: false,
                error: 'You cannot deactivate your own account.'
              });
        }
    }

    const changes = {};
    const oldValues = {};
    const newValues = {};
    const changedFields = [];

    if (role && role !== user.role) {
      oldValues.role = user.role;
      newValues.role = role;
      changedFields.push('role');
      user.role = role;
    }

    if (typeof isActive === 'boolean' && isActive !== user.isActive) {
      oldValues.isActive = user.isActive;
      newValues.isActive = isActive;
      changedFields.push('isActive');
      user.isActive = isActive;
    }

    if (changedFields.length > 0) {
      await user.save();
      
      await createAuditLog({
        action: 'UPDATE',
        entity: 'USER',
        entityId: user._id,
        userId: req.user.id,
        changes: {
          oldValue: oldValues,
          newValue: newValues,
          changedFields
        }
      });
    }
    
    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
