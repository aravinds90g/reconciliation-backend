const socketIO = require('socket.io');

let io;

const init = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Middleware for authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      // Allow connection without auth for dev/testing if needed, or enforce it
      // For now, let's just log and proceed or fail. The provided code has a try-catch stub.
      // return next(new Error('Authentication error')); 
      // Simplified:
      return next();
    }
    
    try {
      // Add your JWT verification logic here
      socket.user = { id: 'user-id-from-token' }; // Placeholder from provided code
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Join user room for private messages
    if (socket.user && socket.user.id) {
      socket.join(`user-${socket.user.id}`);
    }
    
    // Handle file upload progress
    socket.on('upload-progress', (data) => {
      const { jobId, progress } = data;
      if (socket.user) {
        socket.to(`user-${socket.user.id}`).emit('upload-progress', {
          jobId,
          progress,
          timestamp: new Date()
        });
      }
    });
    
    // Handle reconciliation progress
    socket.on('reconcile-progress', (data) => {
      const { jobId, progress, status } = data;
      io.emit('reconcile-progress', {
        jobId,
        progress,
        status,
        timestamp: new Date()
      });
    });
    
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

const emitUploadProgress = (userId, jobId, progress) => {
  if (io) {
    io.to(`user-${userId}`).emit('upload-progress', {
      jobId,
      progress,
      timestamp: new Date()
    });
  }
};

const emitReconciliationProgress = (jobId, progress, status) => {
  if (io) {
    io.emit('reconcile-progress', {
      jobId,
      progress,
      status,
      timestamp: new Date()
    });
  }
};

const emitNotification = (userId, notification) => {
  if (io && userId) {
    io.to(`user-${userId}`).emit('notification', notification);
  }
};

const emitSystemNotification = (notification) => {
  if (io) {
    io.emit('system-notification', notification);
  }
};

module.exports = {
  init,
  emitUploadProgress,
  emitReconciliationProgress,
  emitNotification,
  emitSystemNotification,
  getIO: () => io
};
