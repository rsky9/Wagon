import { Module } from '@nestjs/common'
import { AddressBookController } from './addressbook.controller'
import { AddressBookService } from './addressbook.service'

@Module({
  controllers: [AddressBookController],
  providers: [AddressBookService],
})
export class AddressBookModule {}
