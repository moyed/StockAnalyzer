<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('macro_risks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->tinyInteger('adjustment')->default(0); // -20 to +10
            $table->json('factors')->nullable();           // array of {label, direction, note}
            $table->string('severity', 20)->default('moderate'); // low|moderate|high|critical
            $table->string('outlook', 20)->default('neutral');   // positive|neutral|negative
            $table->text('summary')->nullable();
            $table->timestamp('assessed_at')->nullable();
            $table->timestamps();

            $table->unique('company_id'); // one record per company (upserted on each rescan)
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('macro_risks');
    }
};
