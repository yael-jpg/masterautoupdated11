const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ConfigurationService = require('../services/configurationService');
const { requireAuth, requireRole } = require('../middleware/auth');
const SystemSettingsService = require('../services/systemSettingsService')
const NotificationService = require('../services/notificationService')
const { emitSettingsUpdated } = require('../realtime/hub')

// Optional auth middleware - decodes token if provided
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret);
      req.user = payload;
    } catch (error) {
      // Token invalid but we don't fail - just continue without user
      console.error('Invalid token:', error.message);
    }
  }
  next();
}

// Middleware to require Admin or SuperAdmin role (read / general edit)
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required' });
  }
  next();
};

// Middleware to require SuperAdmin only (price changes, delete pricing, add services)
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'SuperAdmin') {
    return res.status(403).json({ error: 'SuperAdmin access required. Price changes, delete and service management are restricted to SuperAdmin.' });
  }
  next();
};

// Keys that are price/discount sensitive — only SuperAdmin may change these
const PRICE_SENSITIVE_CATEGORIES = new Set(['quotations']);
const PRICE_SENSITIVE_KEYS = new Set([
  'service_prices', 'custom_services', 'vehicle_sizes',
  'minimum_down_payment_percentage', 'tax_vat_rate',
  'default_service_pricing', 'sales_target_amount',
]);

/**
 * GET /api/config
 * Get all configuration settings
 * Optional auth - returns more data if authenticated as admin
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const config = await ConfigurationService.getAllSettings();
    
    // For non-admin users, return only safe settings
    if (!['Admin', 'SuperAdmin'].includes(req.user?.role)) {
      return res.json({
        data: {
          general: config.general || [],
          business: config.business || [],
          payment: config.payment?.filter(c => c.key !== 'online_payment_provider') || []
        }
      });
    }
    
    return res.json({ data: config });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/config/category/:category
// Return settings for a single category (array format) - public read-only
// This route intentionally allows unauthenticated reads for frontend pages.
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params
    const settingsObj = await ConfigurationService.getByCategory(category)

    // Convert object format to array of { key, value, description, type }
    const settingsArray = Object.entries(settingsObj || {}).map(([key, entry]) => ({
      key,
      value: entry.value ?? null,
      description: entry.description ?? '',
      type: entry.type ?? 'string',
    }))

    return res.json(settingsArray)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
})

/**
 * GET /api/config/:category
 * Get settings by category (admin only)
 */
router.get('/:category', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await ConfigurationService.getByCategory(category);
    
    return res.json({
      category,
      settings,
      count: Object.keys(settings).length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/validate
 * Validate configuration input
 */
router.post('/validate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category, key, value } = req.body;
    
    if (!category || !key) {
      return res.status(400).json({ error: 'Category and key are required' });
    }
    
    const validation = await ConfigurationService.validateInput(category, key, value);
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    return res.json({ valid: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/config/:category/:key
 * Update a specific configuration setting.
 * Price/discount-sensitive keys are restricted to SuperAdmin.
 */
router.put('/:category/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category, key } = req.params;
    const { value, reason } = req.body;

    // Enforce SuperAdmin for price/discount-sensitive changes
    if (
      (PRICE_SENSITIVE_CATEGORIES.has(category) || PRICE_SENSITIVE_KEYS.has(key)) &&
      req.user?.role !== 'SuperAdmin'
    ) {
      return res.status(403).json({ error: 'SuperAdmin access required to change prices or discounts.' });
    }
    
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    // Validate input (skip 'Setting not found' — update() will upsert it)
    const validation = await ConfigurationService.validateInput(category, key, value);
    if (!validation.valid && validation.error !== 'Setting not found') {
      return res.status(400).json({ message: validation.error });
    }
    
    // Update setting
    const result = await ConfigurationService.update(category, key, value, req.user.id, reason);

    const flatKey = `${category}.${key}`
    await SystemSettingsService.upsertMany({ [flatKey]: value }).catch(() => {})

    emitSettingsUpdated({
      source: 'config',
      category,
      key,
      updatedBy: req.user?.id || null,
      updatedAt: new Date().toISOString(),
    })

    const label = `${category}.${key}`
    await NotificationService.create({
      role: 'admin',
      title: 'Configuration Updated',
      message: `Admin updated ${label}`,
      payload: { type: 'configuration', category, key, updatedBy: req.user?.id || null },
    }).catch(() => {})
    await NotificationService.create({
      role: 'client',
      title: 'System Configuration Updated',
      message: `${label} has been updated by admin.`,
      payload: { type: 'configuration', category, key },
    }).catch(() => {})
    
    return res.json({
      success: true,
      message: result.message,
      category,
      key,
      newValue: value
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/config/:category/reset
 * Reset category to defaults — SuperAdmin only.
 */
router.post('/:category/reset', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { category } = req.params;
    
    const result = await ConfigurationService.resetToDefaults(category, req.user.id);
    
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/logs/audit
 * Get audit logs
 */
router.get('/logs/audit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;
    
    const logs = await ConfigurationService.getAuditLogs(
      category || null,
      parseInt(limit),
      parseInt(offset)
    );
    
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/frontend
 * Get configuration formatted for frontend
 */
router.get('/display/frontend', async (req, res) => {
  try {
    const config = await ConfigurationService.getConfigForFrontend();
    return res.json({ data: config });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/features/:feature
 * Check if a feature is enabled
 */
router.get('/features/:feature', async (req, res) => {
  try {
    const { feature } = req.params;
    const enabled = await ConfigurationService.isFeatureEnabled(feature);
    
    return res.json({
      feature,
      enabled
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

