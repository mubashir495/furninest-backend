import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/** Rejects malformed Mongo ids with a 400 instead of a CastError (500). */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value) || String(value).length !== 24) {
      throw new BadRequestException('Invalid id.');
    }
    return value;
  }
}
