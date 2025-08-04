const { manualPingLimiter } = require('../middleware/rateLimiter');

// Route to manually trigger a ping
router.post('/:serviceId/ping', auth, manualPingLimiter, async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    
    // Verify service belongs to user
    const service = await PingService.findOne({ _id: serviceId, userId: req.user._id });
    if (!service) {
      return res.status(404).json({ message: 'Service not found or unauthorized' });
    }

    // Get the pingScheduler instance
    const pingScheduler = req.app.get('pingScheduler');
    if (!pingScheduler) {
      return res.status(500).json({ message: 'Ping scheduler not available' });
    }

    // Trigger the ping
    const success = await pingScheduler.triggerPing(serviceId);
    
    if (success) {
      res.json({ message: 'Manual ping triggered successfully' });
    } else {
      res.status(400).json({ message: 'Failed to trigger ping' });
    }
  } catch (error) {
    console.error('Error triggering manual ping:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}); 