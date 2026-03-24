# Vehicle System Implementation Checklist

## Pre-Implementation Review
- [ ] Read README_VEHICLE_SYSTEM.md for complete overview
- [ ] Review database schema in 029_vehicle_makes_models.sql
- [ ] Understand Philippine plate format: XX1234XXXX
- [ ] Verify 31 vehicle brands are appropriate for business

## Database Setup
- [ ] Backup existing database
- [ ] Execute migration: `029_vehicle_makes_models.sql`
- [ ] Verify table creation:
  - [ ] vehicle_makes (31 brands)
  - [ ] vehicle_models (~35 models)
  - [ ] vehicle_variants (specifications)
  - [ ] v_vehicle_catalog (view)
- [ ] Test database queries:
  ```sql
  SELECT COUNT(*) FROM vehicle_makes;  -- Should be 31
  SELECT * FROM vehicle_makes LIMIT 5; -- Verify data
  ```

## Backend Setup

### Step 1: Add Service Layer
- [ ] Create `backend/src/services/vehicleService.js`
- [ ] Verify methods:
  - [ ] createVehicle()
  - [ ] getVehicleById()
  - [ ] getCustomerVehicles()
  - [ ] updateVehicle()
  - [ ] deleteVehicle()
  - [ ] getAllMakes()
  - [ ] getMakesByCategory()
  - [ ] getModelsForMake()
  - [ ] checkPlateAvailability()
  - [ ] searchByPlate()
  - [ ] getVehicleStats()

### Step 2: Add Validation
- [ ] Create `backend/src/utils/vehicleValidation.js`
- [ ] Verify functions:
  - [ ] validatePlateNumber()
  - [ ] normalizePlateNumber()
  - [ ] validateVehicleMake()
  - [ ] validateCustomMake()
  - [ ] validateVehicleModel()
  - [ ] validateVehicleData()
  - [ ] Database helper methods

### Step 3: Add Routes
- [ ] Create `backend/src/routes/vehicleRoutes.js`
- [ ] Register in `backend/src/app.js`:
  ```javascript
  const vehicleRoutes = require('./routes/vehicleRoutes');
  app.use('/api/vehicles', vehicleRoutes);
  ```
- [ ] Verify middleware imported:
  - [ ] authenticateToken
  - [ ] Error handling middleware

### Step 4: Testing
- [ ] Start backend server
- [ ] Test endpoints with Postman/curl:
  - [ ] GET /api/vehicles/makes/all (should return 31)
  - [ ] GET /api/vehicles/makes/category/Japanese (should return 10)
  - [ ] GET /api/vehicles/models/1 (should return Toyota models)
  - [ ] POST /api/vehicles (create test vehicle)

## Frontend Setup

### Step 1: Add Data
- [ ] Create `frontend/src/data/vehicleMakes.js`
- [ ] Verify contains:
  - [ ] VEHICLE_MAKES array (31 brands)
  - [ ] Models for each brand (5-9 models)
  - [ ] Helper functions

### Step 2: Add Validation
- [ ] Create `frontend/src/utils/vehicleValidation.js`
- [ ] Verify functions:
  - [ ] validatePlateNumber()
  - [ ] validateVehicleMake()
  - [ ] validateVehicleModel()
  - [ ] formatPlateNumber()
  - [ ] suggestMakes()
  - [ ] flagSuspiciousPlate()

### Step 3: Add Component
- [ ] Create directory: `frontend/src/components/VehicleInputForm/`
- [ ] Create `VehicleInputForm.jsx` in directory
- [ ] Create `VehicleInputForm.css` in directory
- [ ] Verify component features:
  - [ ] Searchable dropdown
  - [ ] Brand logos visible
  - [ ] Dynamic model dropdown
  - [ ] Plate input with preview
  - [ ] Year, Color, Body Type fields
  - [ ] Form validation
  - [ ] Submit handler

### Step 4: Testing
- [ ] Start frontend dev server
- [ ] Navigate to VehicleInputForm component
- [ ] Test interactions:
  - [ ] Type "Toy" to search for Toyota
  - [ ] Select Toyota and verify models load
  - [ ] Enter plate XX1234XXXX
  - [ ] Verify plate preview shows formatted (XX 1234 XXXX)
  - [ ] Submit form and check network requests

## Integration with Existing Pages

### Option 1: Customer Registration
- [ ] Add VehicleInputForm to customer registration workflow
- [ ] Pass customerId from registration form
- [ ] Store vehicle reference for registration

### Option 2: Booking Creation
- [ ] Add VehicleInputForm to booking page
- [ ] Allow selecting existing vehicle or creating new
- [ ] Store vehicle_id with booking record

### Option 3: Standalone Vehicle Manager
- [ ] Create new page for vehicle management
- [ ] Show list of customer vehicles
- [ ] Allow add/edit/delete operations
- [ ] Use VehicleInputForm for create/edit

## Example Integration Code

### Basic Usage
```javascript
import VehicleInputForm from '@/components/VehicleInputForm/VehicleInputForm';

function MyPage() {
  const handleVehicleSubmit = async (vehicleData) => {
    const response = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...vehicleData,
        customerId: 123
      })
    });
    const { data } = await response.json();
    console.log('Created vehicle:', data);
  };

  return <VehicleInputForm onSubmit={handleVehicleSubmit} />;
}
```

### With Existing Vehicle Selection
```javascript
function BookingPage() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  useEffect(() => {
    // Fetch existing vehicles
    fetch(`/api/vehicles/customer/${customerId}`)
      .then(r => r.json())
      .then(({ data }) => setVehicles(data));
  }, [customerId]);

  const handleUseExisting = (vehicleId) => {
    setSelectedVehicle(vehicles.find(v => v.id === vehicleId));
  };

  return (
    <div>
      {selectedVehicle ? (
        <div>
          <p>Vehicle: {selectedVehicle.vehicleMake} {selectedVehicle.vehicleModel}</p>
          <button onClick={() => setSelectedVehicle(null)}>Change</button>
        </div>
      ) : (
        <div>
          <h3>Existing Vehicles</h3>
          {vehicles.map(v => (
            <button key={v.id} onClick={() => handleUseExisting(v.id)}>
              {v.vehicleMake} {v.vehicleModel} ({v.plateNumber})
            </button>
          ))}
          <h3>Or Create New</h3>
          <VehicleInputForm onSubmit={/* ... */} />
        </div>
      )}
    </div>
  );
}
```

## API Testing Checklist

### Authentication
- [ ] All endpoints require valid JWT token
- [ ] Test with invalid token -> 401 response
- [ ] Test with expired token -> 401 response

### Vehicle Creation
- [ ] Valid data -> 201 Created
- [ ] Missing customerId -> 400 Bad Request
- [ ] Missing plateNumber -> 400 Bad Request
- [ ] Invalid plate format -> 400 Bad Request
- [ ] Duplicate plate -> 409 Conflict

### Vehicle Retrieval
- [ ] Valid ID -> 200 OK with data
- [ ] Invalid ID -> 404 Not Found
- [ ] Valid customerId -> 200 OK with array

### Vehicle Update
- [ ] Valid update -> 200 OK
- [ ] Invalid plate format -> 400 Bad Request
- [ ] Duplicate new plate -> 409 Conflict

### Vehicle Deletion
- [ ] Valid deletion -> 200 OK
- [ ] Non-existent ID -> 404 Not Found

### Makes & Models
- [ ] GET /api/vehicles/makes/all -> returns array of 31
- [ ] GET /api/vehicles/makes/category/Japanese -> returns array of 10
- [ ] GET /api/vehicles/models/1 -> returns Toyota models
- [ ] Invalid category -> 400 Bad Request
- [ ] Invalid makeId -> returns empty array

### Plate Check
- [ ] Available plate -> { available: true }
- [ ] Existing plate -> { available: false }

## Performance Testing

### Database
- [ ] Query vehicle_makes with index: < 100ms
- [ ] Get models for make: < 100ms
- [ ] Check plate availability: < 100ms

### Frontend
- [ ] Load VehicleInputForm: < 1s
- [ ] Search dropdown: < 200ms response
- [ ] Models dropdown: < 200ms response
- [ ] Form submit: < 2s round-trip

## Security Testing

### Input Validation
- [ ] Plate with special chars: Rejected
- [ ] Custom make with SQL injection: Sanitized
- [ ] Very long input: Truncated/rejected
- [ ] Unicode characters: Handled correctly

### Authorization
- [ ] User can only see own vehicles
- [ ] User cannot delete others' vehicles
- [ ] Admin can see all vehicles
- [ ] Authentication required for write operations

## Deployment Checklist

### Database
- [ ] Migration tested on staging
- [ ] Rollback tested and documented
- [ ] Backup created before migration
- [ ] Production deployment scheduled

### Backend
- [ ] Services and routes tested
- [ ] Environment variables set
- [ ] Error logging configured
- [ ] API documentation updated

### Frontend
- [ ] Build passes without errors
- [ ] Component tested in all browsers
- [ ] Mobile responsiveness verified
- [ ] Assets and logos included

### Production Verification
- [ ] All endpoints responding correctly
- [ ] Database queries performing well
- [ ] No console errors in browser
- [ ] Error handling working properly
- [ ] Logging showing correct data

## Post-Deployment

### Monitoring
- [ ] Set up API endpoint monitoring
- [ ] Monitor database query performance
- [ ] Track error rates
- [ ] Monitor user adoption

### Documentation
- [ ] User guide created
- [ ] Admin guide created
- [ ] API documentation published
- [ ] Troubleshooting guide updated

### Future Enhancements
- [ ] Create vehicle photo upload feature
- [ ] Add bulk import functionality
- [ ] Implement advanced search
- [ ] Add vehicle analytics dashboard

## Sign-Off

- [ ] **Developer**: Code review complete ________________
- [ ] **QA**: Testing complete ________________
- [ ] **Deployment**: Production deployment approved ________________
- [ ] **Product**: Feature acceptance confirmed ________________
- [ ] **Date**: ________________

---

## Quick Reference: File Locations

| Component | File Path | Type |
|-----------|-----------|------|
| DB Migration | `backend/sql/migrations/029_vehicle_makes_models.sql` | SQL |
| Service | `backend/src/services/vehicleService.js` | Node.js |
| Validation (BE) | `backend/src/utils/vehicleValidation.js` | Node.js |
| Routes | `backend/src/routes/vehicleRoutes.js` | Node.js |
| Data | `frontend/src/data/vehicleMakes.js` | React |
| Validation (FE) | `frontend/src/utils/vehicleValidation.js` | React |
| Component | `frontend/src/components/VehicleInputForm/VehicleInputForm.jsx` | React |
| Styles | `frontend/src/components/VehicleInputForm/VehicleInputForm.css` | CSS |
| Docs | `README_VEHICLE_SYSTEM.md` | Markdown |
