const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/pix", async (req, res) => {
    console.log("--- Nova requisição PIX (Ajuste Técnico Avançado) ---");
    
    const apiKey = process.env.MANGOFY_API_KEY ? process.env.MANGOFY_API_KEY.trim() : null;
    const storeCode = process.env.MANGOFY_STORE_CODE ? process.env.MANGOFY_STORE_CODE.trim() : null;

    if (!apiKey || !storeCode) {
        return res.status(500).json({ success: false, error: "Configuração ausente no servidor." });
    }

    try {
        const { payer_name, payer_email, payer_document, payer_phone, amount } = req.body;
        
        const amountInCents = Math.round(parseFloat(amount) * 100);
        
        // Algumas APIs exigem que o external_code não tenha caracteres especiais ou seja apenas números
        const externalCode = `${Date.now()}`;

        // Captura o IP real do cliente (essencial para evitar bloqueios de segurança/fraude)
        const clientIp = req.headers["x-forwarded-for"]?.split(',')[0] || req.socket.remoteAddress || "127.0.0.1";

        const payload = {
            store_code: storeCode,
            external_code: externalCode,
            payment_method: "pix",
            payment_format: "regular",
            installments: 1,
            payment_amount: amountInCents,
            postback_url: process.env.POSTBACK_URL || "https://seusite.com/webhook",
            items: [
                { 
                    name: "Pedido Online",
                    quantity: 1,
                    amount: amountInCents,
                    description: "Compra via Checkout"
                }
            ],
            customer: {
                name: payer_name,
                email: payer_email,
                phone: payer_phone,
                document: payer_document,
                ip: clientIp
            },
            pix: {
                expires_in_days: 1
            }
        };

        console.log(`Enviando para Mangofy: Valor ${amountInCents} centavos, IP: ${clientIp}`);

        const response = await fetch("https://checkout.mangofy.com.br/api/v1/payment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": apiKey,
                "Store-Code": storeCode
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || data.payment_status === "gateway_error" || data.payment_status === "error") {
            console.error("Erro Detalhado Mangofy:", JSON.stringify(data, null, 2));
            
            // Se o erro for especificamente gateway_error, damos uma instrução clara
            if (data.payment_status === "gateway_error") {
                return res.status(500).json({ 
                    success: false, 
                    error: "O gateway da Mangofy recusou a transação. Isso geralmente indica que o PIX não está ativo na sua conta ou os dados do cliente foram rejeitados pelo banco parceiro.",
                    payment_code: data.payment_code
                });
            }

            return res.status(500).json({ 
                success: false, 
                error: data.message || "Erro ao processar pagamento na Mangofy."
            });
        }

        let pixCode = null;
        if (data.pix && data.pix.qrcode_copy_and_paste) pixCode = data.pix.qrcode_copy_and_paste;
        else if (data.pix_code) pixCode = data.pix_code;
        else if (data.qrcode_copy_and_paste) pixCode = data.qrcode_copy_and_paste;

        if (!pixCode) {
            return res.status(500).json({ success: false, error: "PIX criado, mas código de cópia não retornado." });
        }

        return res.json({ success: true, pixCode: pixCode });

    } catch (err) {
        console.error("Erro Crítico:", err);
        return res.status(500).json({ success: false, error: "Erro interno no servidor." });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
