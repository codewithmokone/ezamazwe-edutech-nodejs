# Node.js Express Admin Dashboard

This Node.js application serves as an admin dashboard, providing various functionalities for managing users, sending emails, handling payments, and more. Below is a breakdown of the functionalities and endpoints provided by this application.

## Installation and Setup

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Install dependencies using npm install.
4. Create a '.env' file and configure environment variables like 'PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'OAUTH_CLIENTID', 'OAUTH_CLIENT_SECRET', 'OAUTH_REFRESH_TOKEN', and 'PASSPHRASE'.
5. Run the application using 'npm start'.

## Dependencies Used

'express': Web framework for Node.js
'dotenv': Load environment variables from a .env file
'cors': Cross-Origin Resource Sharing middleware
'body-parser': Middleware for parsing request bodies
'crypto': Node.js cryptographic module
'nodemailer': Module for sending emails
'firebase-admin': Firebase Admin SDK for server-side integration
'express-validator': Express.js middleware for request validation
'moment': Library for date manipulation and formatting

## Endpoints and Functionalities

### 1. Admin User Management

* `POST /create-user`: Create an admin user with email, name, and phone number.
* `PUT /admin-update`: Update admin user profile with UID, email, phone number, and full name.
* `PUT /update-password-reset`: Update admin password and send a notification via email.
* `POST /admin-login`: Authenticate admin user with email and password.
* `POST /reset-password`: Send a password reset link to the user's email.
* `POST /email-verification`: Send an email for account verification.
* `POST /verify-email`: Verify email and update user's email verification status.
* `POST /send-contactus-email`: Send an email to the info desk for contact.
* `GET /check-email-verification`: Check if the email has been verified.

### 2. User Management

* `GET /view-users`: View all users.
* `DELETE /delete-user`: Delete a user by UID.

### 3. Payment Integration

* `POST /payment`: Initiate payment process using PayFast.
* `POST /payfast/callback`: Handle PayFast callback for payment confirmation.
* `POST /notify_url`: Handle PayFast notification for payment status.

## Miscellaneous

* `generateRandomPassword()`: Function to generate a random password.
* `generateVerificationLink()`: Function to generate a unique verification link.
* `generateAPISignature()`: Function to generate API signature for PayFast.

## Server Setup

The server runs on the specified port, either from the environment variable or the default port 4000.

## Notes

Ensure all environment variables are properly configured before running the application.
Proper error handling is implemented throughout the application.
Pay attention to the documentation comments for each endpoint for detailed information.