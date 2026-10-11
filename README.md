# ARGUS — QR Payment Security Assessment

**ARGUS** is a web application that analyzes payment QR codes to identify potential signs of tampering and suspicious payment details before a user makes a transaction.

## Problem Statement

UPI payment QR codes are widely used in shops, cafés, and public spaces. However, these codes can be replaced or altered, potentially redirecting payments to unintended recipients.

Users may not have enough information or time to verify the recipient before approving a payment.

ARGUS addresses this problem by analyzing QR codes, comparing available merchant information, and highlighting potential warning signs in a clear and understandable way.

## Solution

ARGUS allows users to scan or upload a payment QR code and review a risk assessment before paying.

The application:
- Decodes supported UPI payment QR codes.
- Extracts the payee name and UPI ID when available.
- Compares payment details with the supplied merchant information.
- Analyzes QR images for potential signs of tampering.
- Checks registered merchant information when available.
- Uses location information, with permission, to provide additional context.
- Presents a risk verdict, score, and explanation of detected warning signs.

ARGUS is a risk assessment tool. It does not guarantee that a payment is safe or independently authenticate every QR code.

## Technology Stack

- **Frontend:** React, JavaScript
- **Backend:** Python, FastAPI
- **QR Code Analysis:** UPI payload decoding and parsing
- **Image Processing:** OpenCV
- **Location Verification:** Browser Geolocation API and Haversine distance calculation
- **Merchant Management:** Merchant records and registration
- **Hotspot Map:** Leaflet.js and OpenStreetMap
- **Support Chatbot:** Groq API
- **Testing:** Pytest, frontend linting, and production build checks

## Workflow

1. **Upload or Scan:** The user provides a payment QR code image.
2. **Extract Details:** ARGUS decodes the QR code and extracts available payment information.
3. **Compare Information:** The application compares the payee details with the supplied merchant information.
4. **Analyze the Image:** The system checks for potential visual signs of QR code tampering.
5. **Verify Merchant Details:** When registered merchant information is available, the application can check the UPI ID and location.
6. **Generate Assessment:** Available signals are combined to produce a verdict, risk score, and explanation.
7. **Review Results:** The user can review the detected payee, merchant details, and potential warning signs.
8. **Report Suspicious Activity:** Users can optionally submit a dangerous QR report for the hotspot map.

## Features

### QR Code Analysis
- Scan or upload payment QR code images.
- Decode supported UPI payment information.
- Extract payee names and UPI IDs when available.

### Risk Assessment
- Compare payee names with supplied merchant names.
- Identify potential inconsistencies in payment information.
- Analyze images for possible signs of tampering.
- Display risk verdicts and scores with understandable explanations.
- Clearly indicate when a check cannot be completed.

### Merchant Verification
- Register and manage merchant information.
- Compare QR payment details with registered merchant records.
- Check location consistency when sufficient information is available.

### Location Verification
- Use GPS location with user permission.
- Allow manual location selection when supported.
- Handle denied or unavailable location information.
- Consider GPS accuracy when assessing location consistency.

### Scam Hotspot Map
- Display community-submitted dangerous QR reports.
- Group reports by geographic proximity.
- Show available report counts, dates, and risk details.
- Label community reports as unverified.

### Additional Features
- Session-based recent scan history.
- Website-based administrative management.
- English and Malayalam interface support.
- Support chatbot for questions about ARGUS and payment scams.

## Impact

ARGUS helps users pause and review payment QR codes before authorizing transactions.

By highlighting differences in payment information and potential image tampering, the application helps users recognize warning signs that may otherwise go unnoticed.

Merchant and location checks provide additional context for registered businesses, while the hotspot map helps users view locations associated with community-submitted reports.

The system focuses on presenting understandable findings rather than relying on a risk score alone.

## Future Scope

- Develop and evaluate a machine-learning risk model using a carefully labeled dataset.
- Improve OCR and merchant-name extraction across different scripts and image conditions.
- Enhance and validate QR code tampering detection.
- Introduce persistent storage and moderation for hotspot reports.
- Strengthen merchant identity verification and authentication.
- Improve location verification and GPS accuracy handling.
- Conduct user testing to evaluate the usefulness of risk explanations.
- Expand language support and accessibility.

## Important Limitations

- Successfully decoding a QR code does not guarantee that its recipient is trustworthy.
- A matching merchant name does not independently prove payment safety.
- Image analysis may produce false positives or fail to detect some alterations.
- Merchant and location verification depend on the availability and reliability of the underlying information.
- Community-submitted hotspot reports are unverified and should not be treated as confirmed scams.
- A risk score is an indication of potential risk, not a guarantee.

Users should independently verify the payment recipient and transaction details before authorizing a payment.

## Team

**Team VORTEX**

Project: **ARGUS — QR Payment Security Assessment**
