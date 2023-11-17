// Firebase admin SDK Authentication

const express = require('express');     //express - Creates an Express application. The express() function is a top-level function exported by the express module.

require("dotenv").config()

const url = require('url');

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const admin = require('firebase-admin');    //import the firebase-admin package
const  {getAuth} = require('firebase-admin/auth');

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

const db = admin.firestore();

// Add body parsing middleware
app.use(express.json());

app.use(cors());

// Default home page
app.get('/', (req, res) => {
  res.send('Welcome to the admin dashboard!');
});


// Create new user
app.post('/create-user', async (req, res) => {

  const { email, name, phoneNumber, role } = req.body;

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

    res.status(200).json({ message: "User created successfully", userRecord: userRecord });
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

  const { email, password } = req.body;

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
    res.status(401).json({ message: 'Invalid credentials' });
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

// Function to generate the email verification link
// async function generateVerificationLink(email) {
//   try {
//     const actionCodeSettings = {
//       url: 'https://ezamazwe-edutech-nodejs.onrender.com/email-verified', // URL where the user will be redirected after email verification
//       handleCodeInApp: true // This enables the application to handle the code in the app
//     };

//     const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
//     return link;
//   } catch (error) {
//     console.error('Error generating verification link:', error);
//     throw error;
//   }
// }


// Your custom function to generate a verification link using cryptography
// async function generateVerificationLink(email) {

//   // Your logic here to generate a unique verification link using cryptography
//   const hash = crypto.randomBytes(32).toString("hex")
//   // const hash = crypto.createHmac('sha256', secret).update(email).digest('hex');
//   const verificationLink = `http://localhost:4000/verify-email/?code=${hash}&email=${email}`; // Replace with your website URL and unique hash

//   // Add the email and verification code to firestore collection
//   await db.collection('verificationData').add({
//     email,
//     verificationCode: hash,
//     timestamp: admin.firestore.FieldValue.serverTimestamp(),
//   });

//   return verificationLink;
// }

async function generateVerificationLink(email) {
  try {
    // Your logic here to generate a unique verification link using cryptography
    const hash = crypto.randomBytes(32).toString('hex');

    // Const for the verification link
    const verificationLink = `http://localhost:4000/verify-email/?code=${hash}&email=${email}`;

    // Add the email and verification code to Firestore collection
    await db.collection('verifyEmail').add({
      email,
      verificationCode: hash,
    });

    return verificationLink;

  } catch (error) {
    // Handle any potential errors here
    console.error('Error generating verification link:', error);
    throw error; // You might want to handle errors differently as per your application's requirements
  }
}

console.log(crypto.randomBytes(32).toString("hex"))

// Send account verification email to user
app.post('/email-verification', async (req, res) => {
  try {
    const { email } = req.body;

    console.log("Send email: ", email);

    const link = await generateVerificationLink(email);

    console.log('Verification link:', link);

    // Email content and configuration
    const mailOptions = {
      from: process.env.MAIL_USERNAME,
      to: email,
      subject: 'Email Verification',
      text: 'Please click the link to verify your email.' + link,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ', info.response);
    res.status(200).json({ message: 'Email sent successfully!' + link });

  } catch (error) {
    console.error('Error sending email: ', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});


// Sends verification email to the user
app.post('/verify-email', async (req, res) => {

  try {
    const { code, email } = req.query;

    console.log("code: ", code);
    console.log("email: ", email);

    // Check if 'code' and 'email' parameters exist
    if (!code || !email) {
      return res.status(400).json({ error: 'Verification code or email is missing.' });
    } else {
      const verificationSnapshot = await db.collection('verifyEmail')
        .where('email', '==', email)
        .where('verificationCode', '==', code)
        .get();

      if (verificationSnapshot.empty) {
        return res.status(404).json({ error: 'Verification code or email is invalid.' });
      }
    }

    // Get the user by email from Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    console.log("User: ", userRecord.uid);

    if (userRecord.uid) {
      // Update the user's custom claims to mark email as verified
      await getAuth(admin).updateUser(userRecord.uid, { verifiedEmail: true });
    }

    const user = await admin.auth().getUserByEmail(email);
    console.log("User: ", user);


    return res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({ error: 'Failed to verify email.' });
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
    from: process.env.MAIL_USERNAME,
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


// adding admin privileges to a user by setting custom claims using the Firebase Authentication SDK
app.post('/change-admin-role', (req, res) => {
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
