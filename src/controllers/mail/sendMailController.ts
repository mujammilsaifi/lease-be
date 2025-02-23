import { RequestHandler } from 'express';
import { transporter } from '../../config/nodemailer';
import dotenv from 'dotenv';
dotenv.config();
export const sendMailController: RequestHandler = async (req, res, next) => {
  try {
    const file = req.file;
    console.log({ file });
    const emails = req.body.emails;
    console.log({ emails });
    if (!emails) {
      return res.status(404).json({ error: 'Please provide Emails' });
    }

    if (!file) {
      return res.status(400).send('No file uploaded.');
    }

    // Create an email message
    const currentDate = new Date();
    const monthYear = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
    }).format(currentDate);

    const mailOptions = {
      // from: {
      //   // name: 'Anish Kumar',
      //   address: process.env.USER_EMAIL,
      // },
      from: process.env.USER_EMAIL,
      to: emails,
      subject: `Financial Monthly Report - ${monthYear}`,
      text: `Dear recipient,
  
  Attached is the financial report for the month of ${monthYear}. Please review the attached Excel file for a detailed overview of our financial performance.
  
  Thank you for your attention.
  
  Best regards,
  Anish Kumar`,
      attachments: [
        {
          filename: file.originalname,
          content: file.buffer,
          encoding: 'base64',
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    };

    // Send the email
    await transporter.sendMail(mailOptions, (error: any, info: any) => {
      if (error) {
        console.error(`Error sending email: ${error.message}`);
        return res.status(500).send(`Error sending email: ${error.message}`);
      }
      console.log('Email sent:', info.response);
      return res.status(200).send('Email sent: ' + info.response);
    });
  } catch (error: any) {
    console.error(`Error processing request: ${error.message}`);
    return res.status(500).send(`Error processing request: ${error.message}`);
  }
};
