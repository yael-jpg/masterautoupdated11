const db = require('../config/db');

class ConfigurationService {
  /**
   * Ensure default settings exist (insert-if-missing, no overwrite)
   */
  static async ensureDefaults(defaultEntries = [], userId = null) {
    try {
      if (!Array.isArray(defaultEntries) || defaultEntries.length === 0) {
        return { success: true, inserted: 0 };
      }

      let inserted = 0;
      for (const entry of defaultEntries) {
        const category = String(entry?.category || '').trim();
        const key = String(entry?.key || '').trim();
        if (!category || !key) continue;

        const rawValue = entry?.value;
        const isObject = typeof rawValue === 'object' && rawValue !== null;
        const value = isObject ? JSON.stringify(rawValue) : String(rawValue ?? '');
        const dataType = entry?.dataType || (isObject ? 'json' : null);
        const description = entry?.description || null;

        const result = await db.query(
          `INSERT INTO configuration_settings (category, "key", value, data_type, description, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (category, "key") DO NOTHING
           RETURNING category`,
          [category, key, value, dataType, description, userId]
        );

        if (result.rowCount > 0) inserted += 1;
      }

      return { success: true, inserted };
    } catch (error) {
      throw new Error(`Failed to ensure default configuration: ${error.message}`);
    }
  }

  /**
   * Get all configuration settings
   */
  static async getAllSettings() {
    try {
      const {rows} = await db.query(
        'SELECT category, "key", value, data_type, description FROM configuration_settings ORDER BY category, "key"'
      );
      
      // Group by category
      const grouped = {};
      rows.forEach(row => {
        if (!grouped[row.category]) {
          grouped[row.category] = [];
        }
        grouped[row.category].push({
          key: row.key,
          value: this._parseValue(row.value, row.data_type),
          description: row.description
        });
      });
      
      return grouped;
    } catch (error) {
      throw new Error(`Failed to fetch configuration: ${error.message}`);
    }
  }

  /**
   * Get settings by category
   */
  static async getByCategory(category) {
    try {
      const {rows} = await db.query(
        'SELECT "key", value, data_type, description FROM configuration_settings WHERE category = $1 ORDER BY "key"',
        [category]
      );
      
      const result = {};
      rows.forEach(row => {
        result[row.key] = {
          value: this._parseValue(row.value, row.data_type),
          description: row.description,
          type: row.data_type
        };
      });
      
      return result;
    } catch (error) {
      throw new Error(`Failed to fetch ${category} configuration: ${error.message}`);
    }
  }

  /**
   * Get single configuration value
   */
  static async get(category, key) {
    try {
      const {rows} = await db.query(
        'SELECT value, data_type FROM configuration_settings WHERE category = $1 AND "key" = $2',
        [category, key]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      return this._parseValue(rows[0].value, rows[0].data_type);
    } catch (error) {
      throw new Error(`Failed to fetch configuration value: ${error.message}`);
    }
  }

  /**
   * Update configuration setting
   */
  static async update(category, key, value, userId, changeReason = null) {
    try {
      // Get old value for audit log
      const oldValue = await this.get(category, key);
      
      // Update setting (UPSERT — creates the row if it doesn't exist yet)
      const isObject = typeof value === 'object' && value !== null;
      const stringValue = isObject ? JSON.stringify(value) : String(value);
      const dataType = isObject ? 'json' : null;
      
      await db.query(
        `INSERT INTO configuration_settings (category, "key", value, data_type, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (category, "key") DO UPDATE
           SET value = EXCLUDED.value,
               data_type = COALESCE(EXCLUDED.data_type, configuration_settings.data_type),
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [category, key, stringValue, dataType, userId]
      );
      
      // Log the change
      await this._logChange(category, key, oldValue, value, userId, changeReason);
      
      return { success: true, message: `${key} updated successfully` };
    } catch (error) {
      throw new Error(`Failed to update configuration: ${error.message}`);
    }
  }

  /**
   * Validate configuration input
   */
  static async validateInput(category, key, value) {
    try {
      const {rows} = await db.query(
        'SELECT data_type FROM configuration_settings WHERE category = $1 AND "key" = $2',
        [category, key]
      );
      
      if (rows.length === 0) {
        return { valid: false, error: 'Setting not found' };
      }
      
      const dataType = rows[0].data_type;
      
      // Validate based on data type
      switch (dataType) {
        case 'boolean':
          if (!['true', 'false', true, false].includes(value)) {
            return { valid: false, error: 'Value must be boolean (true/false)' };
          }
          break;
          
        case 'number':
          if (isNaN(value) || value === '') {
            return { valid: false, error: 'Value must be a number' };
          }
          break;
          
        case 'json':
          try {
            if (typeof value === 'string') {
              JSON.parse(value);
            }
          } catch {
            return { valid: false, error: 'Value must be valid JSON' };
          }
          break;
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get audit logs with filtering
   */
  static async getAuditLogs(category = null, limit = 50, offset = 0) {
    try {
      let query = 'SELECT * FROM configuration_audit_logs';
      const params = [];
      let paramIndex = 1;
      
      if (category) {
        query += ` WHERE category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);
      
      const {rows} = await db.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM configuration_audit_logs';
      const countParams = [];
      let countParamIndex = 1;
      
      if (category) {
        countQuery += ` WHERE category = $${countParamIndex}`;
        countParams.push(category);
        countParamIndex++;
      }
      
      const {rows: countRows} = await db.query(countQuery, countParams);
      const total = parseInt(countRows[0].total);
      
      return {
        data: rows,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          totalPages: Math.ceil(total / limit),
          total,
          limit,
          offset
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch audit logs: ${error.message}`);
    }
  }

  /**
   * Clear audit logs (admin only - requires very high privilege)
   */
  static async clearAuditLogs(beforeDate = null) {
    try {
      let query = 'DELETE FROM configuration_audit_logs';
      const params = [];
      
      if (beforeDate) {
        query += ' WHERE created_at < $1';
        params.push(beforeDate);
      }
      
      await db.query(query, params);
      return { success: true, message: 'Audit logs cleared' };
    } catch (error) {
      throw new Error(`Failed to clear audit logs: ${error.message}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  static async resetToDefaults(category, userId) {
    try {
      // This would typically involve a defaults table or hardcoded defaults
      // For now, we'll just support resetting specific known defaults
      
      const defaults = {
        'general': {
          'time_zone': 'Asia/Manila',
          'date_format': 'MM/DD/YYYY',
          'default_currency': 'PHP'
        },
        'booking': {
          'auto_cancel_unpaid_hours': '48',
          'minimum_booking_notice': '24'
        },
        'payment': {
          'minimum_down_payment_percentage': '30',
          'payment_due_days': '30'
        },
        'pms_email': {
          'enabled': 'true',
          'subject': '',
          'greeting': ''
        },
        'subscription_email': {
          'enabled': 'true',
          'subject': ''
        }
      };
      
      if (!defaults[category]) {
        throw new Error(`No defaults available for category: ${category}`);
      }
      
      const updates = defaults[category];
      
      for (const [key, value] of Object.entries(updates)) {
        await this.update(category, key, value, userId, 'Reset to default');
      }
      
      return { success: true, message: `${category} reset to defaults` };
    } catch (error) {
      throw new Error(`Failed to reset configuration: ${error.message}`);
    }
  }

  /**
   * Check if a feature is enabled
   */
  static async isFeatureEnabled(featureName) {
    try {
      // Parse feature name like "payment.enable_partial_payments"
      const parts = featureName.split('.');
      if (parts.length !== 2) {
        return false;
      }
      
      const [category, key] = parts;
      const value = await this.get(category, key);
      
      return value === true || value === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get configuration for frontend display
   */
  static async getConfigForFrontend() {
    try {
      const allSettings = await this.getAllSettings();
      
      // Extract commonly used settings for frontend
      return {
        general: {
          systemName: await this.get('general', 'system_name'),
          currency: await this.get('general', 'default_currency'),
          dateFormat: await this.get('general', 'date_format'),
          timezone: await this.get('general', 'time_zone'),
          logoUrl: await this.get('general', 'system_logo_url')
        },
        booking: {
          branchLocations: await this.get('booking', 'branch_locations')
        },
        features: {
          guestBooking: await this.isFeatureEnabled('booking.enable_guest_booking'),
          partialPayments: await this.isFeatureEnabled('payment.enable_partial_payments'),
          vehicleMakes: await this.isFeatureEnabled('vehicle.enable_vehicle_makes'),
          onlinePayment: await this.isFeatureEnabled('payment.enable_online_payment')
        },
        payment: {
          acceptedMethods: await this.get('payment', 'accepted_payment_methods'),
          minimumDownPayment: await this.get('payment', 'minimum_down_payment_percentage')
        },
        business: {
          name: await this.get('business', 'business_name'),
          address: await this.get('business', 'business_address'),
          contact: await this.get('business', 'business_contact'),
          email: await this.get('business', 'business_email'),
          taxVatRate: await this.get('business', 'tax_vat_rate')
        }
      };
    } catch (error) {
      throw new Error(`Failed to prepare frontend config: ${error.message}`);
    }
  }

  /**
   * Private helper - parse value based on data type
   */
  static _parseValue(value, dataType) {
    if (value === null || value === undefined) {
      return null;
    }
    
    switch (dataType) {
      case 'boolean':
        return value === 'true' || value === true || value === 1;
      case 'number':
        return parseFloat(value);
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        // Attempt JSON parse if it looks like an object/array even if dataType is missing
        if (typeof value === 'string' && (value.trim().startsWith('{') || value.trim().startsWith('['))) {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
    }
  }

  /**
   * Private helper - log configuration change
   */
  static async _logChange(category, key, oldValue, newValue, userId, changeReason) {
    try {
      const oldValueStr = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue);
      const newValueStr = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);
      
      await db.query(
        'INSERT INTO configuration_audit_logs (category, "key", old_value, new_value, changed_by, change_reason) VALUES ($1, $2, $3, $4, $5, $6)',
        [category, key, oldValueStr, newValueStr, userId, changeReason || null]
      );
    } catch (error) {
      console.error('Failed to log configuration change:', error);
      // Don't throw - logging should not fail the main operation
    }
  }
}

module.exports = ConfigurationService;
