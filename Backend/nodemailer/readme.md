``` mermaid
sequenceDiagram
    autonumber
    participant Index as index.js
    participant Email as email.js
    participant Google as Google OAuth2 & SMTP

    Index->>Email: require('./email')
    Note over Email: 1. dotenv loads .env variables
    Note over Email: 2. nodemailer.createTransport() builds transporter
    Email->>Google: transporter.verify() [Async check]
    Email-->>Index: exports sendEmail function
    Index->>Email: sendEmail(to, subject, text, html)
    Email->>Google: transporter.sendMail(options)
    Google-->>Email: Returns messageId & status
    Email-->>Index: Logs result to console


```