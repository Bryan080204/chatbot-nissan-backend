```text
---------------------------------------------------------------------------------------
|                       ARQUITECTURA CHATBOT NISSAN OAXACA                             |
---------------------------------------------------------------------------------------
                                           |
                                           v
---------------------------------------------------------------------------------------
| 1. CLIENTE / USUARIO                                                                 |
|    Envia un mensaje por WhatsApp desde su celular (ej. "Info" o "Agendar Cita")|
---------------------------------------------------------------------------------------
                                           |
                                           v (Red de WhatsApp)
---------------------------------------------------------------------------------------
| 2. META FOR DEVELOPERS (WhatsApp Cloud API)                                           |
|    • Recibe el mensaje en la plataforma de Meta.                                      |
|    • Convierte la interaccion en un paquete JSON estructurado.                        |
---------------------------------------------------------------------------------------
                                           |
                                           v (Peticion HTTP POST)
---------------------------------------------------------------------------------------
| 3. WEBHOOK (Puerta de Entrada / Endpoint /webhook)                                    |
|    • Valida el Token de seguridad de Meta.                                            |
|    • Recibe el Payload JSON (Ngrok en desarrollo / SSL HTTPS en produccion).          |
---------------------------------------------------------------------------------------
                                           |
                                           v
---------------------------------------------------------------------------------------
| 4. SERVIDOR NODE.JS (Backend - Express)                                              |
|    • Procesa la logica de negocio y menu de opciones.                                |
|    • Lee mensajes entrantes y prepara las respuestas automaticas.                    |
-----------------------------------T-----------------------------------T---------------
                                    |                                   |
              Consultas SQL (mssql) |                                   | Peticion HTTP POST (axios)
                                    v                                   v
---------------------------------------     -------------------------------------------
| 5. SQL SERVER 2025 (Base de Datos)    |   | 6. META CLOUD API / RESPUESTA            |
|    • Clientes (Historial / Datos)     |   |    Meta entrega la respuesta de vuelta   |
|    • Inventario (Stock de refacciones)|   |    a la pantalla de WhatsApp del cliente |
|    • Citas (Agendamiento de taller)   |   |    en segundos.                          |
---------------------------------------     -------------------------------------------
                                    ^
                                    | Peticiones API REST (Consultas del panel)
                                    |
-----------------------------------+---------------------------------------------------
| 7. DASHBOARD WEB (Vue.js)                                                             |
|    • Interfaz grafica para asesores de la agencia Nissan.                             |
|    • Consulta y gestion en tiempo real de citas agendadas y stock de inventario.      |
---------------------------------------------------------------------------------------
```
