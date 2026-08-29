<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->bigInteger('volume')->nullable()->after('last_price');
            $table->decimal('avg_volume', 15, 2)->nullable()->after('volume');
            $table->timestamp('volume_updated_at')->nullable()->after('price_updated_at');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['volume', 'avg_volume', 'volume_updated_at']);
        });
    }
};
