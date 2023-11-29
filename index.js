// Firebase admin SDK Authentication

const express = require('express');     //express - Creates an Express application. The express() function is a top-level function exported by the express module.

require("dotenv").config()

const cors = require('cors');

// const payfast = require('payfast');

const bodyParser = require('body-parser');

const url = require('url');

const crypto = require('crypto');

const nodemailer = require('nodemailer');

const admin = require('firebase-admin');    //import the firebase-admin package
const { getAuth } = require('firebase-admin/auth');

const { check, validationResult } = require('express-validator');

const app = express();

const axios = require('axios');

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
app.use(bodyParser.urlencoded({ extended: false }));

// Default home page
app.get('/', (req, res) => {
  res.send('Welcome to the admin dashboard!');
});


/**
 * Creating admin user endpoint.
 * @param {string} email - admin email address.
 * @param {string} name - admin name.
 * @param {string} phoneNumber - admin phone number.
 * 
 * Returns - Admin created successfully or error message
 */
app.post('/create-user', [
  check('email').isEmail().withMessage('Invalid email address'),
  check('name').notEmpty().withMessage('Provide a name'),
  check('phoneNumber').notEmpty().withMessage('Invalid phone number'),
], async (req, res) => {

  const { email, name, phoneNumber } = req.body;

  // Generates a random password
  const password = generateRandomPassword();

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: phoneNumber,
      emailVerified: false,
    });

    console.log("Email: ", email)
    console.log("Password: ", password)

    const url = "https://ezamazwe-edutech-cms.firebaseapp.com/"

    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true, permissions: "editor", forcePasswordReset: true });
    // await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true, permissions: "owner", forcePasswordReset: false });

    // Send the random password to user's email
    await sendRandomPasswordEmail(email, password, url);

    const user = await admin.auth().getUserByEmail(email);

    res.status(200).json({ message: "Admin created successfully", userRecord: user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Handles updating user profile
app.put('/admin-update', async (req, res) => {

  const { uid, phoneNumber } = req.body;

  if (!uid) {
    return res.status(400).send('No user is provided.');
  }

  // Check if the provided phone number already exists for another user
  const userExists = await getUserByPhoneNumber(phoneNumber);
  if (userExists && userExists.uid !== uid) {
    return res.status(400).send('Phone number already exists for another user.');
  }

  getAuth()
    .updateUser(uid, {
      phoneNumber: phoneNumber,
    })
    .then((userRecord) => {
      // See the UserRecord reference doc for the contents of userRecord.
      console.log('Successfully updated user', userRecord.toJSON());
    })
    .catch((error) => {
      console.log('Error updating user:', error);
    });
});


/**
 * Admin password update endpoint and sends a notification via email
 * @param {string} email - admin email address.
 * 
 * Returns - Password updated successfully
 */
app.put('/update-password-reset', async (req, res) => {

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send('Email is required.');
    }

    // Email content and configuration
    const mailOptions = {
      from: process.env.MAIL_USERNAME,
      to: email,
      subject: 'Password Update',
      text: 'You are about to update your admin password.',
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ', info.response);
    res.status(200).json({ message: 'Email sent successfully!' });


    const userRecord = await admin.auth().getUserByEmail(email);

    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true, permissions: "editor", forcePasswordReset: false });

    await getAuth().updateUser(userRecord.uid, { emailVerified: true }); // Sets the emailVerified to true 


    const user = await admin.auth().getUserByEmail(email); // Gets user's profile information using email

    res.status(200).json({ message: "Successful", ...user.customClaims });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }

});


/**
 * Admin login endpoint.
 * @param {string} email - admin email address.
 * @param {alphanumeric} pasword - admin password.
 */
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
      res.status(200).json({ message: 'Authorized', forcePasswordChange: userClaims.forcePasswordReset, permissions: userClaims.permissions });

      // res.status(200).json({ message: 'Authorised' });
    } else {
      res.status(401).json({ message: 'Not authorized' });
    }

  } catch (error) {
    // Handle authentication errors
    res.status(401).json({ message: 'Invalid credentials' });
  }
});


/**
 * Resets forgoting password
 * @param {string} email - user's email.
 */
app.post("/reset-password", [
  check('email').isEmail().withMessage('Invalid email address'),
  check('url').notEmpty().withMessage('Url not provided'),
], (req, res) => {

  const { email, url } = req.body; // Get the user's email from the request body

  console.log("Reset-email: ", email)
  console.log("Reset-redirect-url: ", url)

  const actionCodeSettings = {
    url: url, // URL where the user will be redirected after email verification
    handleCodeInApp: true // This enables the application to handle the code in the app
  };

  admin
    .auth()
    .generatePasswordResetLink(email, actionCodeSettings)
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


async function generateVerificationLink(email) {
  try {
    // Your logic here to generate a unique verification link using cryptography
    const hash = crypto.randomBytes(32).toString('hex');

    // Const for the verification link
    const verificationLink = `https://edutech-app-eecfd.web.app/verify-email/?code=${hash}&email=${email}`;

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


/**
 * Sends an email to the user for account verification
 * @param {string} email - user email address.
 */
app.post('/email-verification', [
  check('email').isEmail().withMessage('Invalid email address'),
], async (req, res) => {
  try {
    const { email } = req.body;

    const link = await generateVerificationLink(email);

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


/**
 * Checks if the code and email match, and verifies account.
 * @param {string} email - user email address.
 * @param {hex} code - user generated code.
 */
app.post('/verify-email', async (req, res) => {

  try {

    const { code, email } = req.body;

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

    // Ensure the user record exists
    if (!userRecord) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update the user's custom claims to mark email as verified
    await getAuth().updateUser(userRecord.uid, { emailVerified: true });

    const user = await admin.auth().getUserByEmail(email);

    // return res.redirect("https://ezamazwe-edutech-client.netlify.app/")
    return res.status(200).json({ message: 'Email verification successful.' });

  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({ error: 'Failed to verify email.' });
  }
});


/**
 * Sends an email to the info desk.
 * @param {string} email - user email address.
 * @param {string} subject - subject from the form.
 * @param {string} message - message from the form.
 * @param {string} firstName - first name from the form.
 * @param {string} lastName - last name from the form.
 * 
 * Returns -  Email sent successful or error message 
 */
app.post('/send-contactus-email', [
  check('email').isEmail().withMessage('Invalid email address'),
  check('subject').notEmpty().withMessage('Provide subject'),
  check('message').notEmpty().withMessage('Provide message'),
  check('firstName').notEmpty().withMessage('Provide firstName'),
  check('lastName').notEmpty().withMessage('Provide lastName'),
], async (req, res) => {

  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors });
  }

  try {

    const { email, firstName, lastName, subject, message } = req.body;

    console.log(email)

    // Email content and configuration
    const mailOptions = {
      from: process.env.MAIL_USERNAME,
      to: process.env.MAIL_USERNAME,
      subject: subject,
      text: `Hi, \nNames: ${firstName} ${lastName}. \nEmail: ${email} \nMessage: ${message}`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ', info.response);
    res.status(200).json({ message: 'Email sent successfully!' });

  } catch (error) {
    console.error('Error sending email: ', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});


/**
 * Checks if the email has been verifies.
 * @param {string} email - user/admin email address.
 * 
 * Returns - Email is verified on success or email is not verified
 */
app.get('/check-email-verification', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is missing.' });
    }

    const userRecord = await admin.auth().getUserByEmail(email);

    if (userRecord.emailVerified) {

      console.log("User: ", userRecord)

      return res.status(200).json({ message: 'Email is verified.', userRecord: userRecord });
    } else {
      console.log("User: ", userRecord)
      return res.status(200).json({ message: 'Email is not verified.', userRecord: userRecord });
    }
  } catch (error) {
    console.error('Error checking email verification:', error);
    return res.status(500).json({ error: 'Failed to check email verification.' });
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
async function sendRandomPasswordEmail(email, password, url) {
  const mailOptions = {
    from: process.env.MAIL_USERNAME,
    to: email,
    subject: "Your Account Information",
    text: `Your account has been created. Your random password is: ${password} and follow this link ${url} to login.`,
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


/**
 * Endpoint for viewing all the users.
 * 
 * Returns - List of users
 */
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


/**
 * Deletes a user using a user Id.
 * @param {alphanumeric} uid - user Identity.
 * 
 * Returns -  Email sent successful or error message 
 */
app.delete('/delete-user', async (req, res) => {
  const uid = req.body.uid;     // User's UID to delete

  try {
    await admin.auth().deleteUser(uid);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


app.post('/payfast/callback', (req, res) => {
  const postData = req.body;
  const signature = req.get('pf_signature');

  const data = JSON.stringify(postData);
  const calculatedSignature = crypto
    .createHmac('md5', secureKey)
    .update(data)
    .digest('hex');

  if (calculatedSignature === signature) {
    console.log('PayFast callback received and validated');
    console.log('Subscription data:', postData);

    res.send('OK');
  } else {
    console.error('Invalid PayFast callback signature');
    res.status(400).send('Invalid Signature');
  }
});


// Signature generation
const generateAPISignature = (data, passPhrase = null) => {
  // Arrange the array by key alphabetically for API calls
  let ordered_data = {};
  Object.keys(data).sort().forEach(key => {
    ordered_data[key] = data[key];
  });
  data = ordered_data;

  // Create the get string
  let getString = '';
  for (let key in data) {
    getString += key + '=' + encodeURIComponent(data[key]).replace(/%20/g, '+') + '&';
  }

  // Remove the last '&'
  getString = getString.substring(0, getString.length - 1);
  if (passPhrase !== null) { getString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`; }

  // Hash the data and create the signature
  return crypto.createHash("md5").update(getString).digest("hex");
}


app.post('/payment', function (req, res) {

  const formData = req.body;

  const passPhrase = process.env.PASSPHRASE;

  const signature = generateAPISignature(passPhrase)

  const payFastUrl = 'https://sandbox.payfast.co.za/eng/process';

  // const htmlResponse = `
  //     <html>
  //     <body>
  //         <form action="${payFastUrl}" method="post">
  //             ${Object.entries(formData).map(([key, value]) => `
  //                 <input name="${key}" type="hidden" value="${value.trim()}" />
  //             `).join('')}
  //               <input type="hidden" name="merchant_id" value="${process.env.MERCHANT_ID}" />
  //               <input type="hidden" name="merchant_key" value="${process.env.MERCHANT_KEY}" />
  //               <input type="hidden" name="return_url" value="https://edutech-app-eecfd.web.app/user" />
  //               <input type="hidden" name="cancel_url" value="https://edutech-app-eecfd.web.app/user" />
  //               <input type="hidden" name="notify_url" value="https://www.example.com/notify" />
  //               <input type="hidden" name="amount" value="100.00" />
  //               <input type="hidden" name="item_name" value="Ezamazwe Edutech Premium Courses" />
  //         </form>
  //     </body>
  //     <script>
  //         // Automatically submit the form when the page loads
  //         document.forms[0].submit();
  //     </script>
  //     </html>
  // `;

  const htmlResponse = `
  <html>
  <body>
      <form action="${payFastUrl}" method="post">
          ${Object.entries(formData).map(([key, value]) => `
              <input name="${key}" type="hidden" value="${value.trim()}" />
          `).join('')}
            <input type="hidden" name="return_url" value="https://edutech-app-eecfd.web.app/user" />
            <input type="hidden" name="cancel_url" value="https://edutech-app-eecfd.web.app/user" />
            <input type="hidden" name="notify_url" value="https://ezamazwe-edutech-nodejs.onrender.com/notify_url" />
            <input type="hidden" name="amount" value="100.00" />
            <input type="hidden" name="pf_payment_id" value="1089250" />
            <input type="hidden" name="payment_status" value="COMPLETE" />
            <input type="hidden" name="item_name" value="Ezamazwe Edutech Premium Courses" />
      </form>
  </body>
  <script>
      // Automatically submit the form when the page loads
      document.forms[0].submit();
  </script>
  </html>
`;


  res.send(htmlResponse);
});


// Payfast notification
app.get('/notify_url', (req,res) => {

  const data = req.body;

  console.log("Payment Notification: ", data)
  console.log("Payment Notification: ", req.body)

  // Perform necessary operations with the received data
  // For example, verify the payment, update the database, etc.
  
  // Send a response indicating that the notification was received
  res.status(200).send('Notification Received');

})




app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
