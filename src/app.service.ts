import {
  BadRequestException,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPaymentInitResponse,
  IPaymentVerifyResponse,
  PaymentInitDTO,
  PaystackInit,
} from './payment.dto';
import { HttpService } from '@nestjs/axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { AxiosError } from 'axios';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class AppService {
  private readonly PAYSTACK_SECRET_KEY = this.configService.getOrThrow<string>(
    'PAYSTACK_SECRET_KEY',
  );
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly datasource: DataSource,
  ) {}
  async initPayment(input: PaymentInitDTO) {
    const response = await this.paystackApiAxiosClient<
      IPaymentInitResponse,
      PaystackInit
    >('post', 'transaction/initialize', {
      ...input,
      callback_url: 'http://localhost:3001/webhook',
    });

    return {
      message: 'Payment initialized successfully',
      url: response.data.authorization_url,
    };
  }

  async verifyPayment(reference: string) {
    const existingRef = await this.datasource.getRepository('Payment').findOne({
      where: { transaction_ref: reference },
    });

    if (existingRef) {
      return {
        message: 'Payment already verified',
      };
    }

    const response = await this.paystackApiAxiosClient<
      IPaymentVerifyResponse,
      null
    >('get', `transaction/verify/${reference}`);

    if (response.data.status !== 'success') {
      throw new UnprocessableEntityException(response.message);
    }

    const payment = this.datasource.getRepository('Payment').create({
      amount: response.data.amount,
      email: response.data.customer.email,
      transaction_ref: response.data.reference,
      status: response.data.status,
    });

    await this.datasource.getRepository('Payment').save(payment);

    return {
      message: 'Payment verified successfully',
    };
  }

  private async verifySignature(input: Request) {
    console.log(input.headers);
    const signature = input.headers['x-paystack-signature'];

    const hash = crypto
      .createHmac('sha512', this.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(input.body))
      .digest('hex');

    return hash === signature;
  }

  async verifyWebhook(input: Request) {
    console.log(input);
    const isSignatureValid = await this.verifySignature(input);

    if (!isSignatureValid) {
      console.log('Signature is not valid');
      return;
    }

    const event = input.body;

    console.log('first event', event);

    if (event.event === 'charge.success') {
      console.log('Charge Success');
      await this.verifyPayment(event.data.reference);
    }

    return {
      message: 'Webhook verified successfully',
    };
  }

  async paystackApiAxiosClient<ResponseT, RequestT>(
    method: 'post' | 'get',
    route: string,
    payload?: RequestT,
  ): Promise<ResponseT> {
    const CONFIG = {
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${this.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const call = this.httpService[method](
      route,
      method === 'get' ? CONFIG : payload,
      method === 'get' ? undefined : CONFIG,
    )
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new BadRequestException(
              'Something went wrong with this request',
            );
          }

          return result.data;
        }),
      )
      .pipe(
        catchError(async (error: AxiosError<Error>) => {
          const responseMessage =
            error?.response?.data?.message ??
            error?.response?.statusText ??
            error.message ??
            'Temporary server error, please try again later';
          const responseStatue = error?.response?.status ?? 500;
          throw new HttpException(responseMessage, responseStatue, {
            cause: new Error(
              responseMessage ?? 'Temporary error, please try again later',
            ),
          });
        }),
      );

    const client = lastValueFrom(call);
    return await client;
  }

  async getPayments() {
    return await this.datasource.getRepository('Payment').find();
  }
}
