import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { PaymentInitDTO } from './payment.dto';
import { Request } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('init-payment')
  async initPayment(@Body() input: PaymentInitDTO) {
    return await this.appService.initPayment(input);
  }

  @Get('verify-payment/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    return await this.appService.verifyPayment(reference);
  }

  @Get('payment-history')
  async paymentHistory() {
    return await this.appService.getPayments();
  }

  @Post('webhook')
  async webhook(@Body() body: Request) {
    return await this.appService.verifyWebhook(body);
  }
}
