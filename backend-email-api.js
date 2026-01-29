// Backend Email API - Node.js
// SMTP ile e-posta gönderme API'si

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = 3000;

// CORS ayarları (browser'dan erişim için)
app.use(cors());
app.use(express.json());

// SMTP Ayarları (webmail.eysglobal.com.tr)
const smtpConfig = {
    host: 'mail.eysglobal.com.tr',
    port: 465,
    secure: true, // 465 portu için SSL kullan
    auth: {
        user: 'danisman@eysglobal.com.tr',
        pass: '1w6dOG35+-*'
    }
};

// E-posta gönderme endpoint'i
app.post('/send-email', async (req, res) => {
    try {
        const { to, subject, body, fromName, fromEmail } = req.body;

        // Validasyon
        if (!to || !subject || !body) {
            return res.status(400).json({ 
                success: false, 
                error: 'to, subject ve body alanları gereklidir' 
            });
        }

        // Nodemailer transporter oluştur
        const transporter = nodemailer.createTransport(smtpConfig);

        // E-posta gönder
        const safeFromName = (fromName || 'EYS Global').toString().replace(/[\r\n]+/g, ' ').trim();
        const safeFromEmail = (fromEmail || '').toString().replace(/[\r\n]+/g, ' ').trim();
        const replyTo = safeFromEmail ? `${safeFromName} <${safeFromEmail}>` : undefined;

        const info = await transporter.sendMail({
            from: '"EYS Global" <danisman@eysglobal.com.tr>',
            to: to,
            subject: subject,
            text: body,
            html: body.replace(/\n/g, '<br>'), // Satır sonlarını <br> ile değiştir
            replyTo
        });

        console.log('Email gönderildi:', info.messageId);

        res.json({ 
            success: true, 
            messageId: info.messageId,
            message: 'E-posta başarıyla gönderildi'
        });

    } catch (error) {
        console.error('E-posta gönderme hatası:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Test endpoint'i
app.get('/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Backend API çalışıyor!',
        smtp: {
            host: smtpConfig.host,
            port: smtpConfig.port
        }
    });
});

// Server'ı başlat
app.listen(PORT, () => {
    console.log(`📧 Email API server çalışıyor: http://localhost:${PORT}`);
    console.log(`🔗 Test: http://localhost:${PORT}/test`);
    console.log(`📨 Send Email: POST http://localhost:${PORT}/send-email`);
});
