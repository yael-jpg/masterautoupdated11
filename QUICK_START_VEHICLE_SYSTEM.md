# Vehicle System - Quick Start Guide

## 5-Minute Overview

The Philippine Vehicle Input System provides:
- **31 vehicle brands** (all common Philippine brands)
- **Searchable dropdown** with autocomplete
- **Dynamic model loading** based on selected brand
- **Philippine plate validation** (XX1234XXXX format)
- **Complete backend API** with validation
- **Professional React component** with error handling

## Installation (5 steps)

### 1. Database (1 min)
```bash
mysql -u root -p masterauto < backend/sql/migrations/029_vehicle_makes_models.sql
```

### 2. Backend Services (2 min)
Copy these files to your backend:
- `vehicleService.js` → `backend/src/services/`
- `vehicleValidation.js` → `backend/src/utils/`
- `vehicleRoutes.js` → `backend/src/routes/`

Register in `backend/src/app.js`:
```javascript
const vehicleRoutes = require('./routes/vehicleRoutes');
app.use('/api/vehicles', vehicleRoutes);
```

### 3. Frontend Data & Utils (1 min)
Copy to your frontend:
- `vehicleMakes.js` → `frontend/src/data/`
- `vehicleValidation.js` → `frontend/src/utils/`

### 4. Frontend Component (1 min)
Create directory: `frontend/src/components/VehicleInputForm/`

Copy to this directory:
- `VehicleInputForm.jsx`
- `VehicleInputForm.css`

### 5. Integrate (1 min)
In your page component:
```javascript
import VehicleInputForm from '@/components/VehicleInputForm/VehicleInputForm';

function MyPage() {
  const handleSubmit = async (vehicleData) => {
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...vehicleData,
        customerId: currentCustomerId
      })
    });
    const result = await res.json();
    console.log('Vehicle created:', result.data);
  };

  return <VehicleInputForm onSubmit={handleSubmit} />;
}
```

## Key Features at a Glance

### Component Props
```javascript
<VehicleInputForm 
  onSubmit={(data) => {}}     // Required: callback on form submit
  initialValues={{}}          // Optional: pre-fill form
  isLoading={false}          // Optional: show loading state
  onError={(error) => {}}    // Optional: handle errors
/>
```

### Component Returns
```javascript
{
  vehicleMake: "Toyota",
  customMake: null,
  vehicleModel: "Vios",
  plateNumber: "XX1234XXXX",
  year: 2023,
  color: "Black",
  bodyType: "sedan",
  fuelType: "petrol",
  transmission: "automatic"
}
```

### API Endpoints

**Create Vehicle**
```
POST /api/vehicles
{
  "customerId": 123,
  "vehicleMake": "Toyota",
  "vehicleModel": "Vios",
  "plateNumber": "XX1234XXXX"
}
```

**Get Makes**
```
GET /api/vehicles/makes/all
Returns: [{ id, name, category, logo_url }, ...]
```

**Get Models for Make**
```
GET /api/vehicles/models/1
Returns: [{ id, name, year_from, year_to }, ...]
```

## Common Use Cases

### Use Case 1: Add Vehicle During Registration
```javascript
function RegisterCustomer() {
  const handleRegister = async (formData) => {
    // Create customer first
    const customer = await createCustomer(formData);
    
    // Then add vehicle
    const vehicle = await fetch('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        vehicleMake: formData.vehicleMake,
        vehicleModel: formData.vehicleModel,
        plateNumber: formData.plateNumber
      })
    });
  };

  return <VehicleInputForm onSubmit={handleRegister} />;
}
```

### Use Case 2: Select Vehicle for Booking
```javascript
function BookingPage() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  useEffect(() => {
    // Load user's existing vehicles
    fetch(`/api/vehicles/customer/${userId}`)
      .then(r => r.json())
      .then(({ data }) => setVehicles(data));
  }, [userId]);

  return (
    <div>
      <h3>Select Vehicle</h3>
      {vehicles.map(v => (
        <button key={v.id} onClick={() => setSelectedVehicleId(v.id)}>
          {v.vehicleMake} {v.vehicleModel}
        </button>
      ))}
      
      <h3>Or Add New</h3>
      <VehicleInputForm onSubmit={async (data) => {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: userId,
            ...data
          })
        });
        const { data: vehicle } = await res.json();
        setSelectedVehicleId(vehicle.id);
      }} />
    </div>
  );
}
```

### Use Case 3: Vehicle Management Page
```javascript
function VehicleManager() {
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    fetch(`/api/vehicles/customer/${userId}`)
      .then(r => r.json())
      .then(({ data }) => setVehicles(data));
  }, [userId]);

  const handleDelete = async (vehicleId) => {
    await fetch(`/api/vehicles/${vehicleId}`, { method: 'DELETE' });
    setVehicles(v => v.filter(x => x.id !== vehicleId));
  };

  return (
    <div>
      <h2>My Vehicles</h2>
      {vehicles.map(v => (
        <div key={v.id}>
          <p>{v.vehicleMake} {v.vehicleModel}</p>
          <p>{v.plateNumber}</p>
          <button onClick={() => handleDelete(v.id)}>Delete</button>
        </div>
      ))}
      
      <h3>Add New Vehicle</h3>
      <VehicleInputForm onSubmit={async (data) => {
        const res = await fetch('/api/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            customerId: userId,
            ...data
          })
        });
        const { data: newVehicle } = await res.json();
        setVehicles([...vehicles, newVehicle]);
      }} />
    </div>
  );
}
```

## Philippine Plate Format

**Format**: `XX1234XXXX`
- **X** = Letter (A-Z)
- **Digit** = Number (0-9)

**Examples**:
- ✅ AB1234CDEF
- ✅ XY9999ZZZZ
- ❌ ABC1234XYZ (too many letters at start)
- ❌ AB12CDEF (too few numbers)
- ❌ AB 1234 CDEF (allowed with auto-cleanup)

## Supported Vehicles

**31 Brands Total:**

| Japanese | Korean | American | European | Chinese |
|----------|--------|----------|----------|---------|
| Toyota | Hyundai | Ford | VW | BYD |
| Honda | Kia | Chevrolet | Mercedes | Geely |
| Mitsubishi | | GMC | BMW | Great Wall |
| Nissan | | Jeep | Audi | Changan |
| Mazda | | | Renault | JAC |
| Isuzu | | | Peugeot | Chery |
| Daihatsu | | | Volvo | |
| Suzuki | | | Fiat | |
| Subaru | | | | |
| Hino | | | | |

## Validation Rules

### Client-Side (UX)
- Real-time plate format validation
- Searchable brand dropdown
- Dynamic model filtering
- Field-level error messages
- Format preview for plate

### Server-Side (Security)
- Plate format validation
- Duplicate plate detection
- Make/model existence check
- Data type validation
- SQL injection prevention

## Troubleshooting

**"No makes showing"**
→ Check API `/api/vehicles/makes/all` is returning data

**"Models not loading"**
→ Verify make is being selected and database has models for that make

**"Invalid plate error"**
→ Use format XX1234XXXX (2 letters + 2 numbers + 4 letters)

**"Can't submit form"**
→ Check all required fields are filled (Make/Custom Make and Model are required)

**"API 401/403 error"**
→ Verify authentication token is valid and user has permission

## Performance Tips

1. **Cache vehicle makes** - They rarely change
   ```javascript
   const cached = localStorage.getItem('vehicleMakes');
   if (!cached) {
     const makes = await fetch('/api/vehicles/makes/all');
     localStorage.setItem('vehicleMakes', JSON.stringify(makes));
   }
   ```

2. **Lazy load models** - Only load when make is selected
   ```javascript
   // Component already does this!
   ```

3. **Debounce search** - On plate input
   ```javascript
   const [plate, setPlate] = useState('');
   const debouncedCheck = useCallback(
     debounce((p) => checkDuplicate(p), 500),
     []
   );
   ```

## File Map

```
backend/
  sql/migrations/
    029_vehicle_makes_models.sql        ← Run on database
  src/
    services/vehicleService.js          ← Service logic
    utils/vehicleValidation.js          ← Backend validation
    routes/vehicleRoutes.js             ← API endpoints

frontend/
  src/
    data/vehicleMakes.js                ← Brand data
    utils/vehicleValidation.js          ← Frontend validation
    components/VehicleInputForm/
      VehicleInputForm.jsx              ← Main component
      VehicleInputForm.css              ← Styles

Documentation/
  README_VEHICLE_SYSTEM.md              ← Full documentation
  VEHICLE_SYSTEM_CHECKLIST.md           ← Implementation checklist
  QUICK_START.md                        ← This file
```

## Next Steps

1. Run database migration ✓
2. Copy backend files and register routes ✓
3. Copy frontend files and styles ✓
4. Add component to your page ✓
5. Test with Postman (API endpoints) ✓
6. Test in browser (component) ✓
7. Deploy! 🚀

## Support

- Full docs: `README_VEHICLE_SYSTEM.md`
- Checklist: `VEHICLE_SYSTEM_CHECKLIST.md`
- API examples: README_VEHICLE_SYSTEM.md → API Usage Examples section
- Database info: Review `029_vehicle_makes_models.sql`

---

**Ready?** Start with Step 1: Database migration!
