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
    console.log("--- Nova requisição PIX (Mangofy Corrigido) ---");
    
    const apiKey = process.env.MANGOFY_API_KEY ? process.env.MANGOFY_API_KEY.trim() : null;
    const storeCode = process.env.MANGOFY_STORE_CODE ? process.env.MANGOFY_STORE_CODE.trim() : null;

    if (!apiKey || !storeCode) {
        console.error("ERRO: Chaves não encontradas no ambiente");
        return res.status(500).json({ success: false, error: "Chaves ausentes no servidor" });
    }

    try {
        const { payer_name, amount, payer_document, payer_email, payer_phone } = req.body;
        const amountInCents = Math.round(parseFloat(amount) * 100);

        // Gerar um external_code único
        const externalCode = `PIX-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

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
                    description: "Pagamento de pedido via checkout"
                }
            ],
            customer: {
                name: payer_name || "Cliente",
                email: payer_email || "cliente@email.com",
                phone: payer_phone || "11999999999",
                document: payer_document || "53347866860",
                ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1"
            },
            pix: {
                expires_in_days: 1
            }
        };

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

        if (!response.ok) {
            console.error("Erro Mangofy:", JSON.stringify(data, null, 2));
            return res.status(response.status).json({ success: false, error: data.error || "Erro na Mangofy" });
        }

        return res.json({
            success: true,
            pixCode: data.pix_code || data.qrcode_copy_and_paste,
            orderId: data.id
        });

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
