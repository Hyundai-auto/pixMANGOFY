const path = require('path');
// Força a leitura do .env do diretório atual
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/pix', async (req, res) => {
    console.log('--- Nova requisição PIX (Mangofy) ---');
    
    const apiKey = process.env.MANGOFY_API_KEY;
    const storeCode = process.env.MANGOFY_STORE_CODE;

    // Log para você ver no Render se o arquivo .env foi lido
    console.log('Verificação de chaves no .env:');
    console.log('- MANGOFY_API_KEY:', apiKey ? 'CARREGADA' : 'AUSENTE');
    console.log('- MANGOFY_STORE_CODE:', storeCode ? 'CARREGADO' : 'AUSENTE');

    if (!apiKey || !storeCode) {
        return res.status(500).json({ 
            success: false, 
            error: 'Chaves ausentes no arquivo .env. Verifique se o arquivo .env foi enviado ao GitHub.' 
        });
    }

    try {
        const { payer_name, amount } = req.body;
        
        const FIXED_CPF = '53347866860';
        const firstName = payer_name ? payer_name.trim().split(' ')[0] : 'Cliente';
        const amountInCents = Math.round(parseFloat(amount) * 100);

        const payload = {
            amount: amountInCents,
            payment_method: 'pix',
            store_code: storeCode,
            customer: {
                name: firstName,
                email: 'cliente@email.com',
                phone: '11999999999',
                document: FIXED_CPF
            },
            address: {
                street: 'Rua Exemplo',
                number: '123',
                zip_code: '01001000',
                neighborhood: 'Bairro',
                city: 'Sao Paulo',
                state: 'SP'
            }
        };

        const response = await fetch('https://checkout.mangofy.com.br/api/v1/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Erro da Mangofy:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({ success: false, error: data.error || 'Erro na Mangofy' });
        }

        return res.json({
            success: true,
            pixCode: data.pix_code || data.qrcode_copy_and_paste,
            orderId: data.id
        });

    } catch (err) {
        console.error('Erro Crítico:', err);
        return res.status(500).json({ success: false, error: 'Erro interno.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor Mangofy rodando na porta ${PORT}`);
});
