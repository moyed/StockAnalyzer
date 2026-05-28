FROM php:8.3-cli

RUN apt-get update && apt-get install -y git unzip libpq-dev && \
    docker-php-ext-install pdo pdo_pgsql pcntl && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /var/www/html
COPY . .
RUN composer install --no-dev --optimize-autoloader

RUN php artisan config:cache || true

EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
