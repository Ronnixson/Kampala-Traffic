# Security Specification for Kla Traffic (Kampala Smart Transit)

This document outlines the security architecture, invariant checks, and malicious payload test definitions used to secure the Firebase Firestore configuration.

## 1. Data Invariants

- **Traffic Incidents (`/traffic_incidents/{incidentId}`)**:
  - Anyone (even unauthenticated guest users) can read the crowdsourced traffic feed to stay updated.
  - Creating/writing a traffic incident requires a valid user session (`request.auth.uid != null`).
  - An incident ID must match the document path variable (`incidentId`).
  - Custom fields must obey strictly configured type boundaries (e.g. `severity` must be one of `Low`, `Medium`, `High`, `Critical`).
  - Values must have size constraints to prevent Denial-of-Wallet attacks (e.g., location name length bounded).
  - Incidents are immutable once saved (no updates or deletes allowed from client SDKs to ensure data integrity).

- **Boda Reviews (`/boda_reviews/{reviewId}`)**:
  - Anyone can read the safety score statistics and reviews.
  - Creation requires a valid authenticated user session.
  - Plate numbers, incident types, sentiments, and safety scores must be within expected values.
  - Reviews are immutable once written; deletes are disabled on the client side to keep of a public ledger.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 specific JSON payloads designed to violate identity or integrity, which are rejected by our secure rules.

### Payload 1: Unauthorized Incident Creation (No Auth)
- **Path**: `/traffic_incidents/incident101`
- **Violation**: Creating an incident with null authentication.
- **Payload**:
  ```json
  {
    "id": "incident101",
    "location": "Jinja Road",
    "severity": "High",
    "cause": "Accident",
    "alternativeRouteSuggested": false,
    "rawInput": "Traffic jam at Nakawa",
    "language": "English",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "Hacker"
  }
  ```

### Payload 2: Incident Location Size Exploitation (Denial of Wallet)
- **Path**: `/traffic_incidents/incident102`
- **Violation**: Location name length exceeds 100 characters.
- **Payload**:
  ```json
  {
    "id": "incident102",
    "location": "Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa Nakawa",
    "severity": "Medium",
    "cause": "Rain",
    "alternativeRouteSuggested": false,
    "rawInput": "Rain",
    "language": "English",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "User"
  }
  ```

### Payload 3: Invalid Severity Option
- **Path**: `/traffic_incidents/incident103`
- **Violation**: Severity value set to invalid string 'Extreme'.
- **Payload**:
  ```json
  {
    "id": "incident103",
    "location": "Wandegeya",
    "severity": "Extreme",
    "cause": "Potholes",
    "alternativeRouteSuggested": false,
    "rawInput": "Traffic jam Wandegeya",
    "language": "Luganda",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "User"
  }
  ```

### Payload 4: ID Mismatch Attack
- **Path**: `/traffic_incidents/incident_mismatch`
- **Violation**: `id` property in body does not match the URL document ID.
- **Payload**:
  ```json
  {
    "id": "incident104_different",
    "location": "Ntinda Corner",
    "severity": "Low",
    "cause": "Police stop",
    "alternativeRouteSuggested": false,
    "rawInput": "Ntinda smooth",
    "language": "English",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "User"
  }
  ```

### Payload 5: Missing Required Fields
- **Path**: `/traffic_incidents/incident105`
- **Violation**: Creating without required field `cause`.
- **Payload**:
  ```json
  {
    "id": "incident105",
    "location": "Seeta",
    "severity": "High",
    "alternativeRouteSuggested": true,
    "rawInput": "Broken down trailer",
    "language": "English",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "User"
  }
  ```

### Payload 6: Invalid Boda Safety Score (Too High)
- **Path**: `/boda_reviews/review101`
- **Violation**: Safety score set to 99 (must be 0-10).
- **Payload**:
  ```json
  {
    "id": "review101",
    "riderPlate": "UFD 111A",
    "incidentType": "Safe Ride",
    "sentiment": "Positive",
    "reviewText": "Awesome safety standard by pilot.",
    "safetyScore": 99,
    "timestamp": "2026-06-01T09:00:00Z"
  }
  ```

### Payload 7: Invalid Boda Plate Number Format Size
- **Path**: `/boda_reviews/review102`
- **Violation**: Plate number string too long (Denial of Wallet).
- **Payload**:
  ```json
  {
    "id": "review102",
    "riderPlate": "UFD 1111111111111111111111111111111111111A",
    "incidentType": "Safe Ride",
    "sentiment": "Positive",
    "reviewText": "Normal rider.",
    "safetyScore": 8,
    "timestamp": "2026-06-01T09:00:00Z"
  }
  ```

### Payload 8: Fake Sentiment Injection
- **Path**: `/boda_reviews/review103`
- **Violation**: Sentiment set to 'Highly Angry' instead of permitted values.
- **Payload**:
  ```json
  {
    "id": "review103",
    "riderPlate": "UFD 222B",
    "incidentType": "Severe Speeding",
    "sentiment": "Highly Angry",
    "reviewText": "Terrible speeding.",
    "safetyScore": 2,
    "timestamp": "2026-06-01T09:00:00Z"
  }
  ```

### Payload 9: Client Timestamp Hijack (Creating with ancient/future times)
- **Path**: `/traffic_incidents/incident109`
- **Violation**: Rule forces verification that timestamp is accurate server time (or fallback to custom checks, but we enforce `request.time` matches or custom validity).
- **Payload**:
  ```json
  {
    "id": "incident109",
    "location": "Nakawa",
    "severity": "Low",
    "cause": "None",
    "alternativeRouteSuggested": false,
    "rawInput": "all smooth",
    "language": "English",
    "timestamp": "1999-01-01T00:00:00Z",
    "reportedBy": "Hacker"
  }
  ```

### Payload 10: Unauthorized Delete Attempt
- **Path**: `/traffic_incidents/incident101`
- **Violation**: Regular user (authenticated or unauthenticated) attempts to delete an incident.
- **Action**: Delete document.

### Payload 11: Shadow Field Injection
- **Path**: `/traffic_incidents/incident111`
- **Violation**: Injecting random administrator flag `isAdmin: true` in user review or incident document.
- **Payload**:
  ```json
  {
    "id": "incident111",
    "location": "Ntinda Corner",
    "severity": "Low",
    "cause": "None",
    "alternativeRouteSuggested": false,
    "rawInput": "Clear",
    "language": "English",
    "timestamp": "2026-06-01T09:00:00Z",
    "reportedBy": "User",
    "isAdmin": true
  }
  ```

### Payload 12: Unauthorized Edit (Immutability Violation)
- **Path**: `/traffic_incidents/incident101`
- **Violation**: Trying to update an existing immutable record.
- **Action**: Update `location` field.

---

## 3. The Test Runner

The tests are simulated to confirm `PERMISSION_DENIED` is triggered for all payloads above. Rules are strictly guarded using verification layers.
