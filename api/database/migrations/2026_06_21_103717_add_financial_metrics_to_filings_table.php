<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('filings', function (Blueprint $table) {
            $table->decimal('eps', 15, 2)->nullable()->after('ai_analysis');
            $table->bigInteger('revenue')->nullable()->after('eps');
            $table->bigInteger('net_profit')->nullable()->after('revenue');
            $table->bigInteger('shares_outstanding')->nullable()->after('net_profit');
        });
    }

    public function down(): void
    {
        Schema::table('filings', function (Blueprint $table) {
            $table->dropColumn(['eps', 'revenue', 'net_profit', 'shares_outstanding']);
        });
    }
};
