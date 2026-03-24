# Vehicle Registration Module - Quick Start Guide

## 🚀 Getting Started

### Step 1: Run Database Migration

Execute the migration to update the vehicles table:

```bash
# Using MySQL CLI
mysql -u your_user -p your_database < backend/sql/migrations/030_vehicles_relational_structure.sql

# Or run through your database client
# Open: backend/sql/migrations/030_vehicles_relational_structure.sql
# Execute all statements
```

### Step 2: Verify Migration Success

```sql
-- Check vehicles table has new columns
DESC vehicles;
-- Should show: make_id, model_id, variant_id, custom_make, custom_model

-- Check migration log
SELECT * FROM migration_log WHERE migration_name = '030_vehicles_relational_structure';

-- Verify views created
SELECT * FROM v_vehicles_detailed LIMIT 1;
```

### Step 3: Test API Endpoints

```bash
# Get all makes
curl http://localhost:5000/api/vehicle-makes

# Get models for Toyota (makeId = 1, adjust as needed)
curl http://localhost:5000/api/vehicle-makes/1/models

# Get variants for Vios (modelId = 1, adjust as needed)
curl http://localhost:5000/api/vehicle-makes/models/1/variants

# Create a vehicle
curl -X POST http://localhost:5000/api/vehicles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "customerId": 1,
    "makeId": 1,
    "modelId": 1,
    "variantId": 1,
    "plateNumber": "AB1234ABC",
    "year": 2021,
    "color": "Black"
  }'
```

### Step 4: Integrate into Frontend

```jsx
// In your customer registration or vehicle management page
import VehicleInputForm from './components/VehicleInputForm/VehicleInputForm'

export default function VehicleManagementPage({ customerId }) {
  const handleSubmit = async (formData) => {
    try {
      const response = await fetch('/api/vehicles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          customerId,
          ...formData
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        alert('Vehicle registered successfully!')
        // Refresh vehicles list
      }
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  return (
    <div>
      <h2>Register Vehicle</h2>
      <VehicleInputForm 
        customerId={customerId}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
```

---

## 📊 Data Flow Summary

1. **User selects Make** → API: `GET /api/vehicle-makes` ✅
2. **User selects Model** → API: `GET /api/vehicle-makes/{makeId}/models` ✅
3. **User selects Variant** → API: `GET /api/vehicle-makes/models/{modelId}/variants` ✅
4. **User submits form** → API: `POST /api/vehicles` with IDs ✅
5. **Database validates** → Triggers check make→model→variant relationships ✅
6. **Vehicle created** → Success response ✅

---

## 🔍 Key Implementation Details

### Cascading Dropdowns
- All dropdowns disabled until parent is selected
- Auto-loading when parent changes
- Search/filter available for makes
- Reset child dropdowns when parent changes

### Validation
- Client-side: Form validation before submission
- Server-side: Relationship validation in service
- Database-level: Triggers prevent invalid data

### Error Handling
- User-friendly error messages
- Loading states while fetching data
- Validation error highlighting
- API error responses with details

### Data Integrity
- Foreign key constraints
- Database triggers for validation
- Soft-delete (status = inactive) instead of hard delete
- Prevents orphaned records

---

## 🧩 Component Structure

```
VehicleInputForm.jsx
├── useVehicleRegistration() hook
│   ├── State management (makes, models, variants)
│   ├── API calls via vehicleApi.js
│   ├── Form validation
│   └── Data preparation
├── Make selector (dropdown with search)
├── Model selector (cascaded from make)
├── Variant selector (optional, cascaded from model)
├── Plate number input (format: XX1234XXX)
├── Vehicle details (year, color, etc.)
└── Submit/Clear buttons
```

---

## 📋 Files Modified/Created

### Database
- ✅ `backend/sql/migrations/030_vehicles_relational_structure.sql` (NEW)

### Backend Services
- ✅ `backend/src/services/vehicleService.js` (UPDATED)

### Backend Routes
- ✅ `backend/src/routes/vehicleRoutes.js` (UPDATED)
- ✅ `backend/src/routes/vehicleMakes.js` (UPDATED)

### Frontend Services
- ✅ `frontend/src/services/vehicleApi.js` (NEW)

### Frontend Hooks
- ✅ `frontend/src/hooks/useVehicleRegistration.js` (NEW)

### Frontend Components
- ✅ `frontend/src/components/VehicleInputForm/VehicleInputForm.jsx` (UPDATED)

### Documentation
- ✅ `VEHICLE_REGISTRATION_IMPLEMENTATION.md` (NEW)
- ✅ `VEHICLE_REGISTRATION_QUICKSTART.md` (NEW - this file)

---

## ⚠️ Important Notes

### Data Migration
The migration includes logic to automatically match existing text-based make/model data to IDs:
- Exact matches are converted to IDs
- Unmatched data is preserved in custom_make/custom_model columns
- No data loss during migration

### Backward Compatibility
The system still supports custom makes/models:
- If user enters custom make → stored in custom_make column
- If user enters custom model → stored in custom_model column
- Allows gradual migration without breaking existing workflows

### Performance
- All new indexes created for optimal query performance
- Cascade relationships prevent N+1 queries
- API responses include all necessary vehicle details

---

## 🐛 Troubleshooting

### Issue: Models dropdown not loading
**Check:**
- Make is selected (not null)
- API endpoint `/api/vehicle-makes/{makeId}/models` returns data
- Browser network tab shows successful request

### Issue: Cascade validation failing
**Check:**
- Selected model actually belongs to selected make
- Database triggers are created
- No errors in server logs

### Issue: Plate number validation error
**Format required:** `XX1234XXX` (2 letters + 4 numbers + 3 letters)
**Examples:** AB1234ABC, MNO9876XYZ

### Issue: Custom data not saving
**Ensure:**
- customMake/customModel columns exist in database
- API endpoint accepts custom fields
- Form correctly passes custom values when no ID selected

---

## 📚 Related Documentation

- [Full Implementation Details](./VEHICLE_REGISTRATION_IMPLEMENTATION.md)
- [Database Schema](./backend/sql/schema.sql)
- [Migration File](./backend/sql/migrations/030_vehicles_relational_structure.sql)
- [API Documentation](./backend/src/routes/vehicleRoutes.js)

---

## ✅ Verification Checklist

Before deploying to production:

- [ ] Migration runs successfully
- [ ] All tables created without errors
- [ ] Triggers are active
- [ ] Indexes created on foreign keys
- [ ] API endpoints tested and working
- [ ] Frontend component integrated
- [ ] Form validation working as expected
- [ ] Plate number uniqueness enforced
- [ ] Cascade relationships validated
- [ ] Custom make/model fallback tested
- [ ] User-friendly error messages displayed
- [ ] Loading states show appropriately

---

## 🎯 Next Steps

1. **Run the database migration**
2. **Test API endpoints with curl or Postman**
3. **Integrate VehicleInputForm into your page**
4. **Test complete user flow**
5. **Deploy to production**

---

**Created:** February 27, 2026
**Module:** Vehicle Registration with Cascading Dropdowns
**Version:** 1.0

For questions or issues, refer to the full implementation documentation.
