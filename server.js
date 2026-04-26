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

        console.log("Enviando payload para Mangofy...");
        
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
        console.log("Resposta da Mangofy recebida.");

        if (!response.ok) {
            console.error("Erro Mangofy (Status " + response.status + "):", JSON.stringify(data, null, 2));
            return res.status(response.status).json({ success: false, error: data.message || "Erro na Mangofy" });
        }

        // Log da resposta completa para depuração no Render
        console.log("Dados da Resposta:", JSON.stringify(data, null, 2));

        // Tenta extrair o código PIX de diferentes locais possíveis na resposta
        let pixCode = null;
        
        if (data.pix && data.pix.qrcode_copy_and_paste) {
            pixCode = data.pix.qrcode_copy_and_paste;
        } else if (data.pix_code) {
            pixCode = data.pix_code;
        } else if (data.qrcode_copy_and_paste) {
            pixCode = data.qrcode_copy_and_paste;
        } else if (data.pix && typeof data.pix === 'string') {
            pixCode = data.pix;
        } else if (data.data && data.data.pix_code) {
            pixCode = data.data.pix_code;
        }

        if (!pixCode) {
            console.error("ERRO: Código PIX não encontrado na resposta da Mangofy.");
            return res.status(500).json({ 
                success: false, 
                error: "Código PIX não gerado pela API.",
                debug: data // Envia os dados para ajudar a identificar onde está o código
            });
        }

        console.log("PIX gerado com sucesso!");
        return res.json({
            success: true,
            pixCode: pixCode,
            orderId: data.payment_code || data.id
        });

    } catch (err) {
        console.error("Erro Crítico no Servidor:", err);
        return res.status(500).json({ success: false, error: "Erro interno no servidor: " + err.message });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
