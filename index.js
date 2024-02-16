const express = require("express"); //express - Creates an Express application. The express() function is a top-level function exported by the express module.

require("dotenv").config(); // Load environment variables

const cors = require("cors"); // Cross-Origin Resource Sharing middleware

const bodyParser = require("body-parser"); // Middleware for parsing request bodies

const crypto = require("crypto"); // Node.js cryptographic module

const nodemailer = require("nodemailer"); // Module for sending emails

const admin = require("firebase-admin"); // Extracting specific functions from firebase-admin

const { getAuth } = require("firebase-admin/auth"); // Extracting specific functions from firebase-admin

const { check, body, validationResult } = require("express-validator"); // Express.js middleware for request validation

const moment = require("moment"); // Library for parsing, validating, manipulating, and formatting dates

const serviceAccount = require("./serviceAccountKey.json"); // Firebase service account key downloaded from Firebase Console

const app = express(); // Create an Express application instance

const port = process.env.PORT || 4000; // Define the port to listen on, either from environment variable or default to 4000

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://edutech-app-eecfd-default-rtdb.firebaseio.com",
});

const db = admin.firestore();

// Set up Express middleware
app.use(express.json()); // Enable Cross-Origin Resource Sharing
app.use(cors()); // Parse incoming JSON requests
app.use(bodyParser.urlencoded({ extended: false })); // Parse incoming URL-encoded requests

// Default home page
app.get("/", (req, res) => {
  res.send("Welcome to the admin dashboard!");
});

/**
 * Creating admin user endpoint.
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "email": "admin@example.com",
 *    "name": "John Doe",
 *    "phoneNumber": "+27123456789"
 * }
 *
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 * @bodyparam {string} name - The name of the admin. (e.g., "John Doe")
 * @bodyparam {string} phoneNumber - The phone number of the admin. (e.g., "+27123456789")
 *
 * @Returns {string} A message indicating whether the admin was created successfully or an error message.
 *
 */
app.post(
  "/create-user",
  [
    // Validation middleware for email, name, and phoneNumber
    body("email").isEmail().withMessage("Invalid email address."),
    body("name").notEmpty().withMessage("Please provide a name."),
    body("phoneNumber").notEmpty().withMessage("Invalid phone number."),
  ],
  async (req, res) => {
    const { email, name, phoneNumber } = req.body;

    // Generates a random password
    const password = generateRandomPassword();

    try {
      // Create a new user record with Firebase Admin SDK
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
        phoneNumber: phoneNumber,
        emailVerified: false,
      });

      // URL for the application
      const url = "https://ezamazwe-edutech-cms.firebaseapp.com/";

      // Set custom claims for the new user
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        admin: true,
        permissions: "editor",
        forcePasswordReset: true,
      });

      // Send the random password to the user's email
      await sendRandomPasswordEmail(email, password, url);

      // Fetch user details
      const user = await admin.auth().getUserByEmail(email);

      // Respond with success message and user details
      res
        .status(200)
        .json({ message: "Admin created successfully", userRecord: user });
    } catch (error) {
      // Handle specific errors and respond with appropriate messages
      if (error.message === "TOO_LONG") {
        res.status(400).json("Phone number too long.");
      } else if (
        error.message ===
        "The phone number must be a non-empty E.164 standard compliant identifier string."
      ) {
        res.status(400).json("Please provide a phone number.");
      } else if (
        error.message === "The email address is improperly formatted."
      ) {
        res.status(400).json("Please provide a valid email.");
      }
      // Respond with generic error message for other errors
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * Handles updating user profile
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "uid": "xX9P3wtMFdSOxRkOlgsUFdaCrVB3",
 *    "email": "admin@example.com",
 *    "name": "John Doe",
 *    "phoneNumber": "+27123456789"
 * }
 * 
 * @bodyparam {alphanumeric} uid - The uid of admin.
 * @bodyparam {string} fullName - The name of the admin. (e.g., "John Doe")
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 * @bodyparam {number} phoneNumber - The phone number of the admin. (e.g., "+271234567890")
 *
 * @Returns {string} A message indicating whether the admin was updated successfully or an error message.
 */
app.put(
  "/admin-update",
  [
    // Validation middleware for email, name, and phoneNumber
    body("uid").notEmpty().withMessage("No user uid provided."),
    body("email").isEmail().withMessage("Invalid email address."),
    body("fullName").notEmpty().withMessage("Please provide a name."),
    body("phoneNumber").notEmpty().withMessage("Invalid phone number."),
  ],
  async (req, res) => {
    const { uid, phoneNumber, email, fullName } = req.body;
    try {
      // Check if user ID is provided
      if (!uid) {
        return res.status(400).json({ error: "No user is provided." });
      }

      // Fetch user record from Firebase Auth
      const userRecord = await admin.auth().getUser(uid);

      // Check if user record exists
      if (!userRecord) {
        return res.status(400).json({ error: "User not found." });
      }

      let response = null;

      // Update user profile information
      await getAuth()
        .updateUser(uid, {
          displayName: fullName,
          email: email,
          phoneNumber: phoneNumber,
        })
        .then((userRecord) => {
          // Log successful user update
          response = { message: "Successfully updated user" };
        })
        .catch((error) => {
          // Log and handle errors during user update
          response = { error: "Error updating user:" };
        });
      // Respond with success message or error
      return res.status(200).json(response);
    } catch (error) {
      // Respond with error message if an exception occurs
      return res.status(400).json(error);
    }
  }
);

/**
 * Endpoint for admin password update and sends a notification via email
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "email": "admin@example.com",
 * }
 * 
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 *
 * @Returns {string} A message indicating whether the admin password was updated successfully or an error message.
 */
app.put("/update-password-reset", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send("Email is required.");
    }

    // Email content and configuration
    const mailOptions = {
      from: process.env.MAIL_USERNAME,
      to: email,
      subject: "Password Update",
      text: "You are about to update your admin password.",
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: ", info.response);
    res.status(200).json({ message: "Email sent successfully!" });

    const userRecord = await admin.auth().getUserByEmail(email); // Gets the admin by email

    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true,
      permissions: "editor",
      forcePasswordReset: false,
    }); // Sets the custom claims for the admin

    await getAuth().updateUser(userRecord.uid, { emailVerified: true }); // Sets the emailVerified to true

    const user = await admin.auth().getUserByEmail(email); // Gets user's profile information using email

    res.status(200).json({ message: "Successful", ...user.customClaims });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Endpoint for admin login.
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 * @bodyparam {alphanumeric} password - The password of the admin. (e.g., "9aBcDeFgHiJkL")
 *
 * @Returns {string} A message indicating whether the admin has logged in successfully or an error message.
 */
app.post(
  "/admin-login",
  [
    check("email").isEmail().withMessage("Invalid email address"), // Validate email format

    check("password")
      .isLength({ min: 6, max: 30 })
      .withMessage("Password must be between 6 and 30 characters"), // Validate password length
  ],
  async (req, res) => {
    const errors = validationResult(req); // Extract validation errors, if any

    // If there are validation errors, respond with a 400 status and the error details
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Extract email and password from the request body
    const { email, password } = req.body;

    try {
      // Authenticate the admin user
      const user = await admin.auth().getUserByEmail(email);

      // If user does not exist, respond with a 401 status and a message indicating invalid email
      if (!user) {
        res.status(401).json({ message: "Invalid email" });
      }

      // Check if the user has admin privileges (custom claim)
      const userClaims = (await admin.auth().getUser(user.uid)).customClaims;

      // If the user has admin privileges, respond with a 200 status and include custom token, permissions, and forcePasswordReset flag
      if (userClaims && userClaims.admin === true) {
        res.status(200).json({
          message: "Authorized",
          forcePasswordChange: userClaims.forcePasswordReset,
          permissions: userClaims.permissions,
        });
      } else {
        // If the user does not have admin privileges, respond with a 401 status and a message indicating not authorized
        res.status(401).json({ message: "Not authorized" });
      }
    } catch (error) {
      // Handle authentication errors, respond with a 401 status and a message indicating invalid credentials
      res.status(401).json({ message: "Invalid credentials" });
    }
  }
);

/**
 * Resets forgoting password
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "email": "admin@example.com",
 * }
 * 
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 *
 * @Returns {string} A message indicating whether password reset email has been successfully or an error message.
 */
app.post(
  "/reset-password",
  [
    // Validation middleware for email and URL
    check("email").isEmail().withMessage("Invalid email address"),
    check("url").notEmpty().withMessage("Url not provided"),
  ],
  (req, res) => {
    const { email, url } = req.body; // Get the user's email from the request body

    // Configuration for the password reset link
    const actionCodeSettings = {
      url: url, // URL where the user will be redirected after email verification
      handleCodeInApp: true, // This enables the application to handle the code in the app
    };

    // Generate a password reset link and handle the response
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

        // Send the password reset email
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            // Log and handle errors in sending the password reset email
            console.error("Error sending password reset email:", error);
            res
              .status(500)
              .json({ error: "Unable to send password reset email." });
          } else {
            // Log successful sending of the password reset email
            console.log("Password reset email sent:", info.response);
            res.status(200).json({ message: "Password reset email sent." });
          }
        });
      })
      .catch((error) => {
        // Log and handle errors in generating the password reset link
        console.error("Error generating password reset link:", error);
        res
          .status(500)
          .json({ error: "Unable to generate password reset link." });
      });
  }
);

/**
 * Function for generating a verification link
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 *
 * @Returns {string} A verication link that include a hash and a user email address.
 */
async function generateVerificationLink(email) {
  try {
    // Your logic here to generate a unique verification link using cryptography
    const hash = crypto.randomBytes(32).toString("hex");

    // Const for the verification link
    const verificationLink = `https://edutech-app-eecfd.web.app/verify-email/?code=${hash}&email=${email}`;

    // Add the email and verification code to Firestore collection
    await db.collection("verifyEmail").add({
      email,
      verificationCode: hash,
    });

    return verificationLink;
  } catch (error) {
    // Handle any potential errors here
    throw error; // You might want to handle errors differently as per your application's requirements
  }
}

/**
 * Endpoint for email verification
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "email": "admin@example.com",
 * }
 * 
 * @bodyparam {string} email - The email address of the admin. (e.g., "admin@example.com")
 *
 * @Returns {string} A message indicating whether verification email was sent successfully or an error message.
 */
app.post(
  "/email-verification",
  [
    // Validation middleware for email
    check("email").isEmail().withMessage("Invalid email address"),
  ],
  async (req, res) => {
    try {
      const { email } = req.body; // Extract the email from the request body

      // Generate email verification link
      const link = await generateVerificationLink(email);

      // Email content and configuration
      const mailOptions = {
        from: process.env.MAIL_USERNAME,
        to: email,
        subject: "Email Verification",
        text: "Please click the link to verify your email." + link,
      };

      // Send the email and handle the response
      const info = await transporter.sendMail(mailOptions);
      res.status(200).json({ message: "Email sent successfully!" + link });
    } catch (error) {
      // Log and handle errors in sending the email
      res.status(500).json({ error: "Failed to send email" });
    }
  }
);

/**
 * Endoint checks if the code and email match, and verifies account.
 * @bodyparam {string} email - The email address of the user. (e.g., "admin@example.com")
 * @bodyparam {hex} code - user generated code.
 *
 * @Returns {string} A message indicating email verification was successfully or an error message.
 */
app.post("/verify-email", async (req, res) => {
  try {
    const { code, email } = req.body;

    // Check if 'code' and 'email' parameters exist
    if (!code || !email) {
      return res
        .status(400)
        .json({ error: "Verification code or email is missing." });
    } else {
      const verificationSnapshot = await db
        .collection("verifyEmail")
        .where("email", "==", email)
        .where("verificationCode", "==", code)
        .get();

      if (verificationSnapshot.empty) {
        return res
          .status(404)
          .json({ error: "Verification code or email is invalid." });
      }
    }

    // Get the user by email from Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    // Ensure the user record exists
    if (!userRecord) {
      return res.status(404).json({ error: "User not found." });
    }

    // Update the user's custom claims to mark email as verified
    await getAuth().updateUser(userRecord.uid, { emailVerified: true });

    const verificationSnapshot = await db
      .collection("verifyEmail")
      .where("verificationCode", "==", code)
      .get();

    // Assuming there's only one document with this code, delete it
    verificationSnapshot.forEach(async (doc) => {
      await db.collection("verifyEmail").doc(doc.id).delete();
    });

    const user = await admin.auth().getUserByEmail(email);

    // return res.redirect("https://ezamazwe-edutech-client.netlify.app/")
    return res.status(200).json({ message: "Email verification successful." });
  } catch (error) {
    console.error("Error verifying email:", error);
    return res.status(500).json({ error: "Failed to verify email." });
  }
});

/**
 * Endpoint for sending contact us email
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "email": "admin@example.com",
 *    "subject": "Subject",
 *    "message": "Message",
 *    "firstName": "John ",
 *    "lastName": "Doe",
 * }
 * @bodyparam {string} email - user email address.
 * @bodyparam {string} subject - subject from the form.
 * @bodyparam {string} message - message from the form.
 * @bodyparam {string} firstName - first name from the form.
 * @bodyparam {string} lastName - last name from the form.
 *
 * @Returns {string} A message indicating contact us email sent successfully or an error message.
 *
 */
app.post(
  "/send-contactus-email",
  [
    // Validation middleware for email, subject, message, first name, and last name
    check("email").isEmail().withMessage("Invalid email address"),
    check("subject").notEmpty().withMessage("Provide subject"),
    check("message").notEmpty().withMessage("Provide message"),
    check("firstName").notEmpty().withMessage("Provide firstName"),
    check("lastName").notEmpty().withMessage("Provide lastName"),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    // Check for validation errors
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors });
    }

    try {
      // Extract request body parameters
      const { email, firstName, lastName, subject, message } = req.body;

      // Email content and configuration
      const mailOptions = {
        from: process.env.MAIL_USERNAME,
        to: process.env.MAIL_USERNAME,
        subject: subject,
        text: `Hi, \nNames: ${firstName} ${lastName}. \nEmail: ${email} \nMessage: ${message}`,
      };

      // Send the email and handle the response
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent: ", info.response);
      res.status(200).json({ message: "Email sent successfully!" });
    } catch (error) {
      // Log and handle errors in sending the email
      console.error("Error sending email: ", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  }
);

/**
 * Endpoint for checking email verification status
 * @bodyparam {string} email - user/admin email address.
 *
 * Returns - Email is verified on success or email is not verified
 */
app.get("/check-email-verification", async (req, res) => {
  try {
    // Extract email from query parameters
    const { email } = req.query;

    // Check if email is provided
    if (!email) {
      return res.status(400).json({ error: "Email is missing." });
    }

    // Retrieve user record from Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);

    // Check if the user's email is verified
    if (userRecord.emailVerified) {
      console.log("User: ", userRecord);

      // Respond with email verified message and user record
      return res
        .status(200)
        .json({ message: "Email is verified.", userRecord: userRecord });
    } else {
      // Respond with email not verified message and user record
      return res
        .status(200)
        .json({ message: "Email is not verified.", userRecord: userRecord });
    }
  } catch (error) {
    // Log and handle errors in checking email verification
    console.error("Error checking email verification:", error);
    return res
      .status(500)
      .json({ error: "Failed to check email verification." });
  }
});

// Handles generating the random password
function generateRandomPassword() {
  // Define the length of the password
  const length = 12;
  // Define the characters used for generating the password
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let password = "";

  // Generate random characters to form the password
  for (let i = 0; i < length; i++) {
    const randomINdex = Math.floor(Math.random() * characters.length);
    password += characters.charAt(randomINdex);
  }
  // Return the generated password
  return password;
}

// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
  // Specify the email service provider
  service: "gmail",
  auth: {
    // Use OAuth2 authentication mechanism
    type: "OAuth2",
    // Provide authentication credentials
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
    clientId: process.env.OAUTH_CLIENTID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    refreshToken: process.env.OAUTH_REFRESH_TOKEN,
  },
});

// Asynchronously sends a random password email to the provided email address
async function sendRandomPasswordEmail(email, password, url) {
  // Define email options including sender, recipient, subject, and body
  const mailOptions = {
    from: process.env.MAIL_USERNAME, // Sender's email address
    to: email, // Recipient's email address
    subject: "Your Account Information", // Email subject
    text: `Your account has been created. Your random password is: ${password} and follow this link ${url} to login.`, // Email body
  };

  try {
    // Attempt to send the email using the configured transporter
    await transporter.sendMail(mailOptions);
  } catch (error) {
    // Handle errors in sending the email
    console.error("Error sending random password email:", error);
    // Throw an error to indicate failure to send the email
    throw new Error("Unable to send random password email.");
  }
}


/**
 * Endpoint for changing the role of a admin
 * @bodyparam {string} email - user/admin email address.
 *
 * @Returns {string} Admin role has been changed or email is not verified
 */
app.post("/change-admin-role", (req, res) => {
  // Extract the email of the new admin from the request body
  const email = req.body.email;

  // Retrieve user by email and add custom admin claims
  admin
    .auth()
    .getUserByEmail(email) // Retrieve user details based on the provided email
    .then((user) => {
      // Set custom user claims to designate the user as an admin
      return admin.auth().setCustomUserClaims(user.uid, { admin: true });
    })
    .then(() => {
      // Respond with success status if the admin role change is successful
      res.json({ status: "success" });
    })
    .catch((error) => {
      // Handle errors and respond with an appropriate error message
      res.status(400).json({ error: error.message });
    });
});

/**
 * Endpoint for retrieving and viewing user records.
 *
 * Returns - List of users
 */
app.get("/view-users", async (req, res) => {
  try {
    // Retrieve user records from Firebase Authentication
    const userRecords = await admin.auth().listUsers();
    // Extract the list of users from userRecords
    const users = userRecords.users;

    // Render an HTML view with user data (uncomment the line below if using a template engine like EJS)
    // res.render('users', { users });

    // Send a JSON response with the list of users
    res.status(200).json(users);
  } catch (error) {
    // Handle errors and respond with an appropriate error message
    res.status(500).send("Error fetching users");
  }
});

/**
 * Endpoint for deleting a user
 * This endpoint accepts JSON formatted data.
 * Example of JSON input:
 * {
 *    "uid": "xX9P3wtMFdSOxRkOlgsUFdaCrVB3",
 * }
 * @param {alphanumeric} uid - user Identity.
 *
 * Returns -  Email sent successful or error message
 */
app.delete("/delete-user", async (req, res) => {
  // Extract the user's UID to delete from the request body
  const uid = req.body.uid;

  try {
    // Delete the user with the specified UID from Firebase Authentication
    await admin.auth().deleteUser(uid);

    // Respond with a success message if the user deletion is successful
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    // Handle errors and respond with an appropriate error message
    res.status(400).json({ error: error.message });
  }
});

// Endpoint for handling PayFast callback
app.post("/payfast/callback", (req, res) => {
  // Extract the post data from the request body
  const postData = req.body;
  // Extract the signature from the request headers
  const signature = req.get("pf_signature");

  // Convert the post data to JSON string
  const data = JSON.stringify(postData);

  // Calculate the signature using HMAC with MD5 hashing algorithm and secure key
  const calculatedSignature = crypto
    .createHmac("md5", secureKey)
    .update(data)
    .digest("hex");

  // Compare the calculated signature with the signature from the request headers
  if (calculatedSignature === signature) {
    // If the signatures match, the PayFast callback is received and validated
    console.log("PayFast callback received and validated");
    console.log("Subscription data:", postData);

    // Send a response of "OK" to acknowledge receipt of the callback
    res.send("OK");
  } else {
    // If the signatures don't match, log an error and send a 400 response with "Invalid Signature"
    console.error("Invalid PayFast callback signature");
    res.status(400).send("Invalid Signature");
  }
});

// Function for generating API signature
const generateAPISignature = (data, passPhrase = null) => {
  // Arrange the array by key alphabetically for API calls
  let ordered_data = {};
  Object.keys(data)
    .sort()
    .forEach((key) => {
      ordered_data[key] = data[key];
    });
  data = ordered_data;

  // Create the get string
  let getString = "";
  for (let key in data) {
    // Encode and concatenate key-value pairs
    getString +=
      key + "=" + encodeURIComponent(data[key]).replace(/%20/g, "+") + "&";
  }

  // Remove the last '&'
  getString = getString.substring(0, getString.length - 1);
  if (passPhrase !== null) {
    getString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(
      /%20/g,
      "+"
    )}`;
  }

  // Hash the data and create the signature
  return crypto.createHash("md5").update(getString).digest("hex");
};

/**
 * Endpoint for initiating a payment through PayFast
 *
 * Returns -  Redirect to payfast payment page or error message
 */
app.post("/payment", function (req, res) {
  // Extract form data from the request body
  const formData = req.body;

  // Retrieve passphrase from environment variables
  const passPhrase = process.env.PASSPHRASE;

  // Generate API signature using the passphrase
  const signature = generateAPISignature(passPhrase);

  // Define PayFast URL (live payment url)
  // const payFastUrl = 'https://wwww.payfast.co.za/eng/process';

  // Define PayFast URL (sandbox for testing)
  const payFastUrl = "https://sandbox.payfast.co.za/eng/process";

  const htmlResponse = `
<html>
<body>
    <form action="${payFastUrl}" method="post">
        ${Object.entries(formData)
          .map(
            ([key, value]) => `
            <input name="${key}" type="hidden" value="${value.trim()}" />
        `
          )
          .join("")}
          <input type="hidden" name="merchant_id" value="10031961" />
          <input type="hidden" name="merchant_key" value="m55oaux6bncnm" />
          <input type="hidden" name="return_url" value="https://edutech-app-eecfd.web.app/" />
          <input type="hidden" name="cancel_url" value="https://edutech-app-eecfd.web.app/" />
          <input type="hidden" name="notify_url" value="https://ezamazwe-edutech-nodejs.onrender.com/notify_url" />
          <input type="hidden" name="amount" value="100.00" />
          <input type="hidden" name="subscription_type" value="1">
          <input type="hidden" name="recurring_amount" value="100.00">
          <input type="hidden" name="frequency" value="4">
          <input type="hidden" name="cycles" value="4">
          <input type="hidden" name="subscription_notify_email" value="true">
          <input type="hidden" name="subscription_notify_webhook" value="true">
          <input type="hidden" name="subscription_notify_buyer" value="true">
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

// Endpoint for receiving and processing payment notifications from PayFast
app.post("/notify_url", async (req, res) => {
  try {
    // Extract data from the notification
    const responseData = req.body;

    // Calculate subscription end date based on billing date and add 3 months
    const subscriptionEndDate = moment(responseData.billing_date).add(
      3,
      "months"
    );

    // Format the subscription end date
    const endDateFormatted = subscriptionEndDate.format("YYYY-MM-DD");

    // Retrieve user details based on the email address from the notification data
    const user = await admin.auth().getUserByEmail(responseData.email_address);

    // Check if the payment is complete and update the user profile accordingly
    if (responseData.payment_status === "COMPLETE") {
      // Update user document in the database with subscription details
      const res = await db.collection("users").doc(user.uid).update({
        subscription: "subscribed",
        subscriptionStartDate: responseData.billing_date,
        subscriptionEndDate: endDateFormatted,
      });
    }

    // Respond with a success message
    res.status(200).send("Notification Received", responseData);
  } catch (error) {
    // Log error if processing fails
    console.error("Error processing notification:", error);
    // Send 500 error response
    res.status(500).send("Internal Server Error");
  }
});

// Start the server and listen on the specified port
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
