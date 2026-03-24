Vehicle Makes Input System

Files added:
- src/data/vehicleMakes.js  (frontend brands array)
- src/components/MakeSelect.jsx  (searchable dropdown with 'Other' option)
- src/components/MakeSelect.css
- backend/sql/migrations/026_vehicle_makes_seed.sql  (migration to create/seed vehicle_makes)
- backend/src/utils/validation.js  (server-side normalization/validation helpers)
- frontend/src/utils/validationClient.js  (client-side helpers)

Integration notes:
- Import `MakeSelect` into the Register Vehicle form and wire `onChange` (selected make name) and `onCustomChange` (custom text).
- Save `make_id` (by resolving the selected name against `vehicle_makes` in the backend) or `custom_make` for 'Other'.
- Normalize plate numbers before saving using `normalizePlate` on the server or via `normalizePlateClient` on the client.
- Run the migration `026_vehicle_makes_seed.sql` against your Postgres DB to create the table and seed brands.

Usage example (React form):

<MakeSelect
  value={selectedMake}
  onChange={(makeName) => setSelectedMake(makeName)}
  onCustomChange={(text) => setCustomMake(text)}
/>

Server-side: use `normalizePlate` and `validateMakeSelection` when creating/updating vehicles.
