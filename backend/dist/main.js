"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
async function bootstrap() {
    try {
        const app = await core_1.NestFactory.create(app_module_1.AppModule);
        const config = app.get(config_1.ConfigService);
        const corsOrigin = config.get('CORS_ORIGIN');
        app.enableCors({
            origin: corsOrigin
                ? corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
                : true,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        });
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
        const port = Number(config.get('PORT', 3000));
        await app.listen(port);
        console.log(`🚀 Application is running on: http://localhost:${port}`);
    }
    catch (error) {
        console.error('❌ Failed to start application:', error);
        process.exit(1);
    }
}
void bootstrap();
//# sourceMappingURL=main.js.map