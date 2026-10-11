# Merchant Mode and location verification

Merchant profiles are stored in SQLite at `data/argus.sqlite3` by default. Set
`ARGUS_DB_PATH` to use a different database file. The database is local and
ignored by Git. Each account owns one profile; passwords are salted PBKDF2
hashes, and login sessions expire after 12 hours.

## Merchant endpoints

- `POST /api/merchant/register` creates an account and profile. JSON fields:
  `email`, `password`, `shop_name`, `upi_id`, `latitude`, `longitude`, and
  optional `radius_m` (25–5000 metres; default 150).
- `POST /api/merchant/login` returns a bearer token.
- `GET /api/merchant/me` and `PUT /api/merchant/me` require that bearer token.
- `POST /api/merchant/logout` revokes the current token.
- `GET /api/merchant/operator/pending` lists pending UPI claims for operator review.
- `POST /api/merchant/operator/verify-upi/{merchant_id}?verified=true` lets an
  operator change UPI verification status. It requires
  `Authorization: Admin <ARGUS_ADMIN_TOKEN>`.

New or changed UPI IDs are `pending`. An operator must independently verify
ownership before setting `verified=true`; creating an Argus account does not
prove control of the payment account. Configure a strong, private
`ARGUS_ADMIN_TOKEN` in the API server environment before using that endpoint.

## Scan location fields

`POST /api/scan` retains the existing multipart fields `file` and
`merchant_name`. It also accepts optional multipart `latitude`, `longitude`,
`accuracy_m`, and `location_status` (`available`, `denied`, or `unavailable`).
The browser only sends coordinates after the user grants location permission.
If permission is denied or location is unavailable, QR and tamper assessment
still complete and the response explains that proximity could not be checked.

The response adds `location_verification`, containing the detected UPI ID,
matched merchant (if any), current and registered coordinates, distance, GPS
accuracy, configured radius, status, and explanation. A mismatch is reported
only when the reported distance minus GPS accuracy exceeds the configured
radius; overlapping accuracy is reported as uncertain. Unknown merchants and
pending UPI claims add risk at the final verdict stage. Location analysis does
not run in or modify the tamper detector.
