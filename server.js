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
    console.log("--- Nova requisição PIX (Mangofy Final) ---");
    
    const apiKey = process.env.MANGOFY_API_KEY ? process.env.MANGOFY_API_KEY.trim() : null;
    const storeCode = process.env.MANGOFY_STORE_CODE ? process.env.MANGOFY_STORE_CODE.trim() : null;

    if (!apiKey || !storeCode) {
        return res.status(500).json({ success: false, error: "Configuração ausente no servidor (.env)" });
    }

    try {
        const { payer_name, amount, payer_document, payer_phone } = req.body;
        
        // Limpeza rigorosa de dados para evitar gateway_error
        const cleanCPF = payer_document.replace(/\D/g, '');
        const cleanPhone = payer_phone.replace(/\D/g, '');
        const amountInCents = Math.round(parseFloat(amount) * 100);
        const externalCode = `PIX-${Date.now()}`;

        const payload = {
            store_code: storeCode,
            external_code: externalCode,
            payment_method: "pix",
            payment_format: "regular",
            installments: 1,
            payment_amount: amountInCents,
            postback_url: process.env.POSTBACK_URL || "https://simples-pay.onrender.com/",
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
                email: "cliente@email.com", // Email fixo para evitar erros de validação se o front não enviar
                phone: cleanPhone,
                document: cleanCPF,
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

        // Se a Mangofy retornar gateway_error ou erro de status
        if (!response.ok || data.payment_status === "gateway_error") {
            console.error("Erro Mangofy:", JSON.stringify(data, null, 2));
            
            let userFriendlyError = "Erro no processamento do PIX.";
            if (data.payment_status === "gateway_error") {
                userFriendlyError = "O gateway de pagamento recusou a transação. Verifique se o CPF é válido ou tente novamente mais tarde.";
            }

            return res.status(500).json({ 
                success: false, 
                error: userFriendlyError,
                status: data.payment_status 
            });
        }

        // Extração do código PIX
        let pixCode = null;
        if (data.pix && data.pix.qrcode_copy_and_paste) pixCode = data.pix.qrcode_copy_and_paste;
        else if (data.pix_code) pixCode = data.pix_code;
        else if (data.qrcode_copy_and_paste) pixCode = data.qrcode_copy_and_paste;

        if (!pixCode) {
            return res.status(500).json({ success: false, error: "PIX gerado, mas código não encontrado na resposta." });
        }

        return res.json({
            success: true,
            pixCode: pixCode,
            orderId: data.payment_code || data.id
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
