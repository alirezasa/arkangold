import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsNationalCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNationalCode',
      target: object.constructor,
      propertyName,
      options: validationOptions,

      validator: {
        validate(value: string) {
          if (!/^\d{10}$/.test(value)) return false;

          if (/^(\d)\1{9}$/.test(value)) return false;

          const check = +value[9];

          const sum =
            value
              .split('')
              .slice(0, 9)
              .reduce((acc, x, i) => acc + +x * (10 - i), 0) % 11;

          return sum < 2 ? check === sum : check === 11 - sum;
        },

        defaultMessage() {
          return 'کد ملی معتبر نیست';
        },
      },
    });
  };
}
