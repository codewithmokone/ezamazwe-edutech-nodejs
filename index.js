// Firebase admin SDK Authentication

const express = require('express');     //express - Creates an Express application. The express() function is a top-level function exported by the express module.

require("dotenv").config()

const url = require('url');

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const admin = require('firebase-admin');    //import the firebase-admin package

const cors = require('cors')

const { check, validationResult } = require('express-validator');

const app = express();

const port = process.env.PORT || 4000;

const serviceAccount = require('./serviceAccountKey.json'); // Key downloaded from Firebase Console

const router = express.Router();

admin.initializeApp({     // Initialize Firebase Admin SDK
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://edutech-app-eecfd-default-rtdb.firebaseio.com"
});

// Add body parsing middleware
app.use(express.json());
// json - Returns middleware that only parses json and only looks at requests where the Content-Type header matches the type option.

app.use(cors());


app.get('/', (req, res) => {
  res.send('Welcome to the admin dashboard!');
});


// Create new user
app.post('/create-user', async (req, res) => {

  const {email, name, phoneNumber, role} = req.body;

  // Generates a random password
  const password = generateRandomPassword();

  console.log("Password: ", password)

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phoneNumber,
      emailVerified: false,
    });

    if (role === "admin") {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    }

    // Send the random password to user's email
    await sendRandomPasswordEmail(email, password)

    // const actionCodeSettings = {
    //   url: 'http://localhost:4000/email-verification', // URL where users should be redirected after verifying their email
    //   handleCodeInApp: true,
    // };

    // const actionCode = getActionCodeFromEmailLink(); // Extract action code from the email link
    // await firebase.auth().applyActionCode(actionCode);

    // // Send the verification email
    // await admin.auth().sendEmailVerification(userRecord.uid, actionCodeSettings);

    // const user = await admin.auth().getUser(userRecord.uid);

    // if (user.emailVerified) {
    //   // User's email is verified
    //   res.status(200).json(userRecord)
    // } else {
    //   // User's email is not verified
    //   res.status(400).json({ error: 'Email not verified' });
    // }

    res.status(200).json({message: "User created successfully", userRecord: userRecord});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Login endpoint for admin
app.post('/admin-login', [
  check('email').isEmail().withMessage('Invalid email address'),
  check('password').isLength({ min: 6, max: 30 }).withMessage('Password must be between 6 and 30 characters')
], async (req, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  console.log(errors.errors)

  const { email, password } = req.body;

  // console.log("Email: ", email)
  // console.log("Pass: ", password)

  try {
    // Authenticate the admin user
    const user = await admin.auth().getUserByEmail(email);

    if (!user) {
      res.status(401).json({ message: 'Invalid email' });
    }

    // Check if the user has admin privileges (custom claim)
    const userClaims = (await admin.auth().getUser(user.uid)).customClaims;

    if (userClaims && userClaims.admin === true) {

      // Respond with the custom token
      res.status(200).json({ message: 'Authorized' });
      console.log()

      // res.status(200).json({ message: 'Authorised' });
    } else {
      res.status(401).json({ message: 'Not authorized' });
    }
  } catch (error) {
    // Handle authentication errors
    res.status(401).json({ error: 'Invalid credentials' });
  }
});


// Handles the reset function 
app.post("/reset-password", (req, res) => {

  const email = req.body.email; // Get the user's email from the request body

  admin
    .auth()
    .generatePasswordResetLink(email)
    .then((link) => {
      const mailOptions = {
        from: process.env.MAIL_USERNAME,
        to: email,
        subject: "Password Reset",
        text: `Click this link to reset your password: ${link}`,
      };

      // Send the email
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending password reset email:", error);
          res.status(500).json({ error: "Unable to send password reset email." });
        } else {
          console.log("Password reset email sent:", info.response);
          res.status(200).json({ message: "Password reset email sent." });
        }
      });
    })
    .catch((error) => {
      console.error("Error generating password reset link:", error);
      res.status(500).json({ error: "Unable to generate password reset link." });
    });
});


// Send account verification email to user
app.post('/email-verification', async (req, res) => {
  const { email } = req.body;
  
  console.log("Send email: ", email);

  // Email content and configuration
  const mailOptions = {
    from: 'your_email@gmail.com',
    to: email,
    subject: 'Email Verification',
    text: 'Please click the link to verify your email.'
    // You can include an HTML version of the email using 'html' key
  };

  try {
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ', info.response);
    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.error('Error sending email: ', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
 
});


// Sends verification email to the user
app.get('/verify-email', async (req, res) => {

  try {
    const { userId } = req.query;

    console.log("User Id: ", userId)

    const actionCodeSettings = {
      url: 'https://ezamazwe-edutech-nodejs.onrender.com/', // URL where users should be redirected after verifying their email
      handleCodeInApp: true,
    };

    // Sending email verification link
    await admin.auth().sendEmailVerification(userId, actionCodeSettings);

    const actionCode = req.query.actionCode;

    await firebase.auth().applyActionCode(actionCode);

    // Get the user's email after verification if needed
    const user = await admin.auth().getUser(userId);

    const email = user.email;

    console.log("User email")

    res.status(200).json({ message: `Email verification successful for ${email}` });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(400).json({ error: 'Email verification failed' });
  }
});


// Handles generating the random password
function generateRandomPassword() {
  const length = 12;
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let password = "";

  for (let i = 0; i < length; i++) {
    const randomINdex = Math.floor(Math.random() * characters.length);
    password += characters.charAt(randomINdex);
  }
  return password;
};


// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
    clientId: process.env.OAUTH_CLIENTID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    refreshToken: process.env.OAUTH_REFRESH_TOKEN
  },
});


// Function to send a random password to the user's email
async function sendRandomPasswordEmail(email, password) {
  const mailOptions = {
    from: "codewithmokone@gmail.com",
    to: email,
    subject: "Your Account Information",
    text: `Your account has been created. Your random password is: ${password}`,
  };

  try {
    // Send the email
    await transporter.sendMail(mailOptions);
    console.log("Random password email sent to:", email);
  } catch (error) {
    console.error("Error sending random password email:", error);
    throw new Error("Unable to send random password email.");
  }
};

app.get('/add-admin-role', (req, res) => {
  res.send('Admin settings dashboard.');
});


// adding admin privileges to a user by setting custom claims using the Firebase Authentication SDK
app.post('/change-admin-role', (req, res) => {     // http://localhost:3000/add-admin
  const email = req.body.email; // Email of the new admin

  // Add custom admin claims to the user 
  admin
    .auth()
    .getUserByEmail(email)
    .then((user) => {
      return admin.auth().setCustomUserClaims(user.uid, { admin: true });
    })
    .then(() => {
      res.json({ status: 'success' });
    })
    .catch((error) => {
      res.status(400).json({ error: error.message });
    });
});


// Fetch and view user records
app.get('/view-users', async (req, res) => {
  try {
    const userRecords = await admin.auth().listUsers();
    const users = userRecords.users;
    // res.render('users', { users });   // For rendering an HTML view.
    res.status(200).json(users);      // For sending a JSON response.
  } catch (error) {
    res.status(500).send('Error fetching users');
  }
});


// Delete a specific user
app.delete('/delete-user', async (req, res) => {
  const uid = req.body.uid;     // User's UID to delete

  try {
    await admin.auth().deleteUser(uid);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
