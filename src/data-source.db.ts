import { DataSource, DataSourceOptions } from 'typeorm';
import { Payment } from './payment.entity';

type TDataSourceOptions = DataSourceOptions & { autoLoadEntities?: true };

export const datasourceOptions = (): TDataSourceOptions => ({
  type: 'sqlite',
  database: 'db.sql',
  entities: [Payment],
  synchronize: true,
});

const datasource = () => new DataSource(datasourceOptions());

export default datasource;
