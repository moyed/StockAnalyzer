<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            // Result of /detect-volume-spike — stored during rescan
            $table->json('volume_analysis')->nullable()->after('price_updated_at');

            // Result of /explain-movement — stored during rescan
            $table->json('movement_explanation')->nullable()->after('volume_analysis');
        });
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn(['volume_analysis', 'movement_explanation']);
        });
    }
};
