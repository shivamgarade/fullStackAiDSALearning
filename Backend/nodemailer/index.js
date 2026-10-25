const sendEmail = require('./email');

sendEmail(
  'shivamgarade05@gmail.com',
  'NodeMailer Test',
  'This is a test email from NodeMailer',
  '<h1>This is a test email from NodeMailer</h1>'
);