export interface CustomerRecord {
  id: string;
  name: string;
}

export interface CustomerStore {
  findCustomerById(id: string): Promise<CustomerRecord | null>;
}
