/**
 * Audit Service
 * Handles logging of all configuration changes for compliance and rollback capabilities
 */

const db = require('../config/db');

class AuditService {
  /**
   * Log a configuration change
   */
  static async logConfigurationChange(connection, logData) {
    try {
      const {
        userId,
        category,
        settingKey,
        oldValue,
        newValue,
        changeDescription,
        ipAddress,
        userAgent,
      } = logData;

      // Ensure we have valid data
      if (!userId || !category || !settingKey) {
        throw new Error('Missing required audit log fields: userId, category, settingKey');
      }

      // Use provided connection or get new one
      const conn = connection || (await db.promise().getConnection());
      const useProvidedConnection = !!connection;

      try {
        const query = `
          INSERT INTO configuration_audit_logs 
          (user_id, category, setting_key, old_value, new_value, change_description, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
          userId,
          category,
          settingKey,
          JSON.stringify(oldValue),
          JSON.stringify(newValue),
          changeDescription,
          ipAddress || null,
          userAgent || null,
        ];

        const [result] = await conn.query(query, params);
        return result;
      } finally {
        // Only release if we created the connection
        if (!useProvidedConnection) {
          conn.release();
        }
      }
    } catch (error) {
      console.error('Failed to log configuration change:', error);
      throw new Error(`Audit logging failed: ${error.message}`);
    }
  }

  /**
   * Get audit logs with filters and pagination
   */
  static async getAuditLogs(filters = {}) {
    try {
      let query = 'SELECT * FROM configuration_audit_logs WHERE 1=1';
      const params = [];

      if (filters.category) {
        query += ' AND category = ?';
        params.push(filters.category);
      }

      if (filters.userId) {
        query += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.settingKey) {
        query += ' AND setting_key = ?';
        params.push(filters.settingKey);
      }

      if (filters.startDate) {
        query += ' AND created_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND created_at <= ?';
        params.push(filters.endDate);
      }

      if (filters.search) {
        query += ' AND (change_description LIKE ?)';
        params.push(`%${filters.search}%`);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 50, 500); // Max 500 records
      const offset = (page - 1) * limit;

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [logs] = await db.promise().query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as total FROM configuration_audit_logs WHERE 1=1';
      const countParams = [];

      if (filters.category) {
        countQuery += ' AND category = ?';
        countParams.push(filters.category);
      }
      if (filters.userId) {
        countQuery += ' AND user_id = ?';
        countParams.push(filters.userId);
      }
      if (filters.settingKey) {
        countQuery += ' AND setting_key = ?';
        countParams.push(filters.settingKey);
      }
      if (filters.startDate) {
        countQuery += ' AND created_at >= ?';
        countParams.push(filters.startDate);
      }
      if (filters.endDate) {
        countQuery += ' AND created_at <= ?';
        countParams.push(filters.endDate);
      }

      const [[{ total }]] = await db.promise().query(countQuery, countParams);

      return {
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to retrieve audit logs: ${error.message}`);
    }
  }

  /**
   * Get audit log for specific configuration change
   */
  static async getLogById(logId) {
    try {
      const [rows] = await db.promise().query(
        'SELECT * FROM configuration_audit_logs WHERE id = ?',
        [logId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error(`Failed to retrieve audit log: ${error.message}`);
    }
  }

  /**
   * Get user activity on configuration
   */
  static async getUserActivitySummary(userId, days = 30) {
    try {
      const [rows] = await db.promise().query(
        `SELECT 
          DATE(created_at) as change_date,
          COUNT(*) as change_count,
          COUNT(DISTINCT category) as categories_modified
         FROM configuration_audit_logs
         WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(created_at)
         ORDER BY change_date DESC`,
        [userId, days]
      );
      return rows;
    } catch (error) {
      throw new Error(`Failed to retrieve user activity summary: ${error.message}`);
    }
  }

  /**
   * Get category change history
   */
  static async getCategoryHistory(category, limit = 50) {
    try {
      const [rows] = await db.promise().query(
        `SELECT * FROM configuration_audit_logs
         WHERE category = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [category, limit]
      );
      return rows;
    } catch (error) {
      throw new Error(`Failed to retrieve category history: ${error.message}`);
    }
  }

  /**
   * Prevent deletion of audit logs (only archival possible)
   */
  static async archiveOldLogs(retentionDays = 365) {
    try {
      // In production, you might archive to a separate table or external storage
      // For now, we prevent deletion and keep all logs
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const [result] = await db.promise().query(
        `SELECT COUNT(*) as old_logs FROM configuration_audit_logs 
         WHERE created_at < ?`,
        [cutoffDate]
      );

      // Note: We do NOT delete, only report for archival
      return {
        eligibleForArchival: result[0].old_logs,
        message: `${result[0].old_logs} logs are eligible for archival (older than ${retentionDays} days)`,
        note: 'Audit logs are never deleted to maintain compliance records.',
      };
    } catch (error) {
      throw new Error(`Failed to check archival status: ${error.message}`);
    }
  }

  /**
   * Generate audit report
   */
  static async generateAuditReport(startDate, endDate) {
    try {
      // Total changes
      const [totalChanges] = await db.promise().query(
        `SELECT COUNT(*) as total FROM configuration_audit_logs 
         WHERE created_at BETWEEN ? AND ?`,
        [startDate, endDate]
      );

      // Changes by category
      const [changesByCategory] = await db.promise().query(
        `SELECT category, COUNT(*) as count FROM configuration_audit_logs
         WHERE created_at BETWEEN ? AND ?
         GROUP BY category`,
        [startDate, endDate]
      );

      // Top modifiers
      const [topModifiers] = await db.promise().query(
        `SELECT u.id, u.name, COUNT(*) as change_count 
         FROM configuration_audit_logs cal
         JOIN users u ON cal.user_id = u.id
         WHERE cal.created_at BETWEEN ? AND ?
         GROUP BY cal.user_id, u.id, u.name
         ORDER BY change_count DESC
         LIMIT 10`,
        [startDate, endDate]
      );

      // Most changed settings
      const [mostChanged] = await db.promise().query(
        `SELECT setting_key, COUNT(*) as change_count 
         FROM configuration_audit_logs
         WHERE created_at BETWEEN ? AND ?
         GROUP BY setting_key
         ORDER BY change_count DESC
         LIMIT 20`,
        [startDate, endDate]
      );

      return {
        period: { startDate, endDate },
        totalChanges: totalChanges[0].total,
        changesByCategory,
        topModifiers,
        mostChangedSettings: mostChanged,
        generatedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to generate audit report: ${error.message}`);
    }
  }
}

module.exports = AuditService;
