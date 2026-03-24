Make → Model → Variant cascading dropdown

Files added in this change:
- backend/sql/migrations/027_vehicle_models_variants.sql
- frontend/src/data/vehicleSpecs.json
- frontend/src/components/MakeModelVariant.jsx
- frontend/src/components/MakeModelVariant.css

Integration notes:
- Run the migration against your DB to create `vehicle_models` and `vehicle_variants` and seed sample rows.

  Example (psql):

```bash
psql -U <user> -d masterauto -f backend/sql/migrations/026_vehicle_makes_seed.sql
psql -U <user> -d masterauto -f backend/sql/migrations/027_vehicle_models_variants.sql
```

- Frontend static data lives in `frontend/src/data/vehicleSpecs.json`. For production, expose an API endpoint that returns nested specs:
  GET `/api/vehicle-specs` -> { make: { model: [variants] } }

- Use `MakeModelVariant` in vehicle registration forms. Example usage:

```jsx
<MakeModelVariant value={{}} onChange={(v) => setVehicleSpec(v)} />
```

- Server-side validation: use `validateMakeModelVariant(db, { makeId, modelId, variantId })` from `backend/src/utils/validation.js` to ensure selections are consistent before saving.

- Normalize plate numbers with `normalizePlate` on the server. Use client helper `normalizePlateClient` (added earlier) for inline normalization.

Optional next steps:
- Add API endpoints to list models by make and variants by model for dynamic fetching.
- Add admin UI to manage models and variants with images.
- Hook images to `vehicle_variants.image_path` for premium display.
