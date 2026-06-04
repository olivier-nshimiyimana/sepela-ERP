# Sepela Portal Admin

React + TypeScript frontend for the Sepela online admin portal.

## Features

- API connection settings for the portal backend
- Overview dashboard for merchants, branches, devices, activation codes, leases, and sync ingestions
- Merchant hierarchy bootstrap form
- Activation code issuing
- Offline lease issuing
- Sync ingestion monitoring

## Run

```bash
cd portal-admin
cp .env.example .env
npm install
npm run dev
```

The bearer token is entered directly in the UI and stored in browser localStorage for the current operator session.

## Backend

This frontend is designed to work with the `portal-api` service in the same repository.
