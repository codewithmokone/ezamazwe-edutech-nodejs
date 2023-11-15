// Firebase admin SDK Authentication

const express = require('express');     //express - Creates an Express application. The express() function is a top-level function exported by the express module.

require("dotenv").config()

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const admin = require('firebase-admin');    //import the firebase-admin package

var cors = require('cors')

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

app.get('/create-user', async (req, res) =>{
  res.send('Create user dashboard.');
});


// Login endpoint for admin
app.post('/admin-login', async (req, res) => {
  const { email } = req.body;

  try {
    // Authenticate the admin user
    const user = await admin.auth().getUserByEmail(email);

    // Check if the user has admin privileges (custom claim)
    const userClaims = (await admin.auth().getUser(user.uid)).customClaims;

    // console.log("Custom Claims: ", userClaims)

    // const role = 'admin';

    if (userClaims && userClaims.admin === true) {
      // const userProfile = {
      //   user
      // };
      console.log("Admin")
      res.status(200).json({ message: 'Authorised', user: userProfile });
    } else {
      console.log("Not Admin")
      res.status(401).json({ message: 'Not authorized' });
    }
    // res.status(200).json({ message: 'Admin login successful' });
  } catch (error) {
    // Handle authentication errors
    res.status(401).json({ error: 'Invalid credentials' });
  }
});


// Create new user
app.post('/create-user', async (req, res) => {

  const email = req.body.email;
  const role = req.body.role;
  
  console.log("Email: ", email);
  console.log("Role: ", role);

  // Generates a random password
  const password = generateRandomPassword();

  console.log("generated password: ", password);

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    // Send the random password to user's email
    await sendRandomPasswordEmail(email, password)

    res.status(200).json(userRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
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
app.post('/add-admin-role', (req, res) => {     // http://localhost:3000/add-admin
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


// Handles the reset function 
app.post("/reset-password", (req, res) => {
    const email = req.body.email; // Get the user's email from the request body
  
    admin
      .auth()
      .generatePasswordResetLink(email)
      .then((link) => {
        const mailOptions = {
          from: "simonlephotojr@gmail.com",
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


// app.post("/reset-password", (req, res) => {
//     const email = req.body.email; // Get the user's email from the request body
  
//     admin
//       .auth()
//       .generatePasswordResetLink(email)
//       .then((link) => {
//         // Send the password reset link to the user's email
//         // You can use your preferred method to send emails, like Nodemailer or a third-party service
//         // For this example, we'll just log the link to the console
//         console.log("Password reset link:", link);
  
//         res.status(200).json({ message: "Password reset email sent." });
//       })
//       .catch((error) => {
//         console.error("Error sending password reset email:", error);
//         res.status(500).json({ error: "Unable to send password reset email." });
//       });
//   });

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
