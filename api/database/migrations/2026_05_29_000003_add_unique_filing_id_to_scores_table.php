<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Remove duplicate score rows, keeping only the latest (highest id) per filing
        DB::statement('
            DELETE FROM scores
            WHERE id NOT IN (
                SELECT MAX(id) FROM scores GROUP BY filing_id
            )
        ');

        Schema::table('scores', function (Blueprint $table) {
            $table->unique('filing_id');
        });
    }

    public function down(): void
    {
        Schema::table('scores', function (Blueprint $table) {
            $table->dropUnique(['filing_id']);
        });
    }
};
